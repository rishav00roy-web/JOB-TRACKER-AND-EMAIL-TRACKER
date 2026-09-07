// Deterministic, local scoring. No LLM calls.
//
// The profile now spans three disjoint worlds — AI literacy, non-technical
// work, and frontend — and a given posting only ever lives in one or two of
// them. Scoring against the whole catalogue at once would mean an ideal
// "AI Content Reviewer, remote" posting scored ~20% purely for not mentioning
// React. So coverage is computed per category and the headline score is the
// best category's coverage.

export type SkillCategory = 'ai' | 'non_technical' | 'technical'

export type Skill = {
  name: string
  weight: number
  category: SkillCategory
}

export type ScrapedJobInput = {
  job_title: string
  company: string
  description: string // Raw posting text, used for scoring and later for resume tailoring
  location?: string
  work_type?: string
  company_tier?: string
  posted_date?: string
  application_link: string
  easy_apply?: boolean
  compensation_insight?: string
}

export type CategoryScores = Record<SkillCategory, number>

// The description is carried through rather than stripped: the resume tailorer
// needs the raw JD text later, and a posting is often gone by the time you want it.
export type ScoredJobResult = ScrapedJobInput & {
  match_score: number
  category_scores: CategoryScores
  best_category: SkillCategory | null
  key_skills_match: string[]
  experience_match_summary: string
  why_fits: string
  niche_flag: boolean
  remote_flag: boolean
  clearance_required: boolean
  on_site_required: boolean
}

const CATEGORIES: SkillCategory[] = ['ai', 'non_technical', 'technical']

// How many of a category's heaviest skills a posting must hit to score 100.
// Real postings ask for a handful of things, not a whole discipline, so scoring
// against the full catalogue punishes good narrow matches. Raise this to make
// the board stricter, lower it to make more things look like a fit.
const SATURATION_COUNT = 6

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  ai: 'AI-focused',
  non_technical: 'non-technical',
  technical: 'technical',
}

// Postings that are AI-adjacent but not engineering roles: the ones worth
// surfacing even when the keyword overlap is thin.
const NICHE_KEYWORDS = [
  'founder', 'founding', 'foia', 'investigator', 'creative', 'experimental',
  'ai trainer', 'red team', 'annotator', 'annotation', 'evaluator', 'rater',
  'conversation design', 'prompt', 'community', 'enablement', 'no-code', 'nocode',
]

const REMOTE_KEYWORDS = ['remote', 'work from home', 'wfh', 'distributed', 'anywhere', 'telecommute']

// A posting can keyword-match "technical" skills (React, TypeScript, Git...)
// while requiring years of unaided senior/staff-level engineering ownership
// the user doesn't have — their real technical skill is AI-assisted building
// (see the ai-assisted-builder profile), not deep unaided infra/architecture
// work. Title-level seniority markers cap the technical score specifically.
// ai/non_technical categories are untouched: seniority there (e.g. "Senior
// AI Content Reviewer") is a realistic target, not a mismatch.
const SENIORITY_TITLE_KEYWORDS = [
  'senior', 'sr.', 'staff', 'principal', 'architect',
  'director of engineering', 'vp of engineering', 'head of engineering', 'engineering manager',
]
const SENIORITY_PENALTY_MULTIPLIER = 0.35

// `technical` (React, TypeScript, Git, SQL, plain "Python"...) was only ever
// meant to be minority-weight supporting signal — a bonus that makes an ai/
// non_technical posting look stronger for also mentioning real tooling, not
// a category that should win the headline on its own. Without a standing
// dampener, a purely mainstream-software-engineering posting with zero ai/
// non_technical language could still win best_category outright, which is
// exactly the "no tech roles" the user is not an unaided professional
// engineer for. Applied unconditionally, before the seniority check below,
// which stacks on top for senior-titled postings specifically.
const TECHNICAL_MINORITY_MULTIPLIER = 0.4

// Federal/government-adjacent postings (FOIA analyst roles especially) are
// frequently labeled "remote" while actually requiring US-person status or
// a security clearance most applicants can't get. This is a hard
// disqualifier, not a soft preference — it suppresses match_score directly
// rather than just flagging, unlike niche_flag below.
const CLEARANCE_KEYWORDS = [
  'security clearance', 'public trust', 'must be a u.s. citizen', 'u.s. citizen required',
  'us citizenship required', 'background investigation', 'unable to sponsor',
  'active clearance', 'secret clearance', 'top secret', 'suitability determination',
  'polygraph', 'obtain a security clearance', 'obtain a clearance', 'must be a us citizen',
]
const CLEARANCE_SUPPRESSION_MULTIPLIER = 0.15

// Some boards (RemoteOK especially) let companies post office-based roles
// under a "remote" listing — the board-level tag is wrong, not the posting
// text itself, which usually says so plainly ("This is an office-based
// role", "Location: <city> Head Office"). User wants remote-only, so this
// is a hard disqualifier, same shape as clearance above. Kept to high-
// precision phrases only — "occasional office visits" or naming an HQ city
// alone shouldn't trigger this, only an explicit on-site requirement.
const ON_SITE_KEYWORDS = [
  'office-based role', 'office based role', 'on-site role', 'onsite role',
  'on-site position', 'onsite position', 'in-office role', 'in office role',
  'must be based in the office', 'required to work from our office',
  'work from our office', 'attend the office', 'commute to the office',
  'no remote work', 'not a remote role', 'must work on-site', 'must work onsite',
  'office-based position', 'this is an office-based',
]
const ON_SITE_SUPPRESSION_MULTIPLIER = 0.15

// Skill names come from the database, so they can contain regex metacharacters
// (C++, Node.js, .NET). Escaping them keeps `new RegExp` from throwing and stops
// "." from matching any character.
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// \b is useless at a non-word edge: /\bC\+\+\b/ can never match, because the
// boundary after "+" needs a word character on one side and there is none.
// Asserting "no alphanumeric adjacent" instead works for both "React" (must not
// match "reactive") and "C++" (must match "C++ heavily").
function buildSkillMatcher(keyword: string) {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(keyword)}(?![a-z0-9])`, 'i')
}

export function scoreJob(job: ScrapedJobInput, userSkills: Skill[]): ScoredJobResult {
  const title = job.job_title || ''
  const textToScan = `${title} ${job.description || ''}`.toLowerCase()
  const lowerTitle = title.toLowerCase()

  const achieved: Record<string, number> = { ai: 0, non_technical: 0, technical: 0 }
  const possible: Record<string, number> = { ai: 0, non_technical: 0, technical: 0 }
  const weightsByCategory: Record<string, number[]> = { ai: [], non_technical: [], technical: [] }
  const matchedSkills: string[] = []

  for (const skill of userSkills) {
    const category: SkillCategory = CATEGORIES.includes(skill.category) ? skill.category : 'technical'
    possible[category] = (possible[category] ?? 0) + skill.weight
    weightsByCategory[category]!.push(skill.weight)

    const keyword = skill.name.toLowerCase().trim()
    if (!keyword) continue

    // Whole-word match only. The previous `|| includes(keyword)` fallback made
    // the boundary check dead code, so "React" matched "reactive".
    if (buildSkillMatcher(keyword).test(textToScan)) {
      achieved[category] = (achieved[category] ?? 0) + skill.weight
      matchedSkills.push(skill.name)
    }
  }

  // Weight needed for a perfect score in each category: the SATURATION_COUNT
  // heaviest skills the user has there.
  const saturationWeight = CATEGORIES.reduce((acc, c) => {
    acc[c] = (weightsByCategory[c] ?? [])
      .slice()
      .sort((a, b) => b - a)
      .slice(0, SATURATION_COUNT)
      .reduce((sum, w) => sum + w, 0)
    return acc
  }, {} as Record<string, number>)

  // Dividing by the whole category is still too harsh: `non_technical` holds 25
  // skills spanning support, writing, records and admin, and no single posting
  // asks for more than a handful. A FOIA role matching FOIA + Communication is
  // an excellent fit, not an 8% one.
  //
  // So full marks means matching the SATURATION_COUNT heaviest skills in the
  // category, not all of them. Categories smaller than that are unaffected.
  const category_scores = CATEGORIES.reduce((acc, c) => {
    const denominator = Math.min(possible[c] ?? 0, saturationWeight[c] ?? 0)
    acc[c] =
      denominator > 0 ? Math.min(100, Math.round(((achieved[c] ?? 0) / denominator) * 100)) : 0
    return acc
  }, {} as CategoryScores)

  // Standing dampener: technical is minority-weight signal, not a category
  // that should win the headline on its own (see TECHNICAL_MINORITY_MULTIPLIER).
  category_scores.technical = Math.round(category_scores.technical * TECHNICAL_MINORITY_MULTIPLIER)

  // Keyword overlap in `technical` doesn't mean qualified: a "Senior DevOps
  // Engineer" posting can hit 100% purely by mentioning React/TypeScript/Git
  // enough times, with zero signal that "Senior" means years of unaided
  // infra ownership the user doesn't have. Cap technical further, on top of
  // the standing dampener above, when the title signals that seniority —
  // ai/non_technical are real targets even at "senior" level, untouched.
  const isSeniorTechnical = SENIORITY_TITLE_KEYWORDS.some((kw) => buildSkillMatcher(kw).test(lowerTitle))
  if (isSeniorTechnical) {
    category_scores.technical = Math.round(category_scores.technical * SENIORITY_PENALTY_MULTIPLIER)
  }

  // Headline score is the strongest category, so a posting is judged against
  // the world it actually belongs to. `technical` is excluded from this
  // selection entirely (not just dampened) — user is not an unaided
  // professional engineer and doesn't want engineering roles surfaced at
  // all, even as a fallback when nothing else matches. A posting that also
  // has real ai/non_technical signal still surfaces at that (lower) score;
  // one with technical-only overlap now correctly falls through to
  // best_category = null and gets dropped at push time, same as zero-match.
  let best_category: SkillCategory | null = null
  let match_score = 0
  for (const c of CATEGORIES) {
    if (c === 'technical') continue
    if ((possible[c] ?? 0) > 0 && category_scores[c] > match_score) {
      match_score = category_scores[c]
      best_category = c
    }
  }

  const isNiche = NICHE_KEYWORDS.some((kw) => lowerTitle.includes(kw))
  const remote_flag = REMOTE_KEYWORDS.some(
    (kw) => lowerTitle.includes(kw) || (job.location || '').toLowerCase().includes(kw) || (job.work_type || '').toLowerCase().includes(kw)
  )

  // Hard disqualifier, not a soft preference — suppresses the headline score
  // directly (category_scores stays the honest keyword-coverage number;
  // match_score is what actually drives the board's ranking/color-tier).
  const clearance_required = CLEARANCE_KEYWORDS.some((kw) => textToScan.includes(kw))
  if (clearance_required) {
    match_score = Math.round(match_score * CLEARANCE_SUPPRESSION_MULTIPLIER)
  }

  const on_site_required = ON_SITE_KEYWORDS.some((kw) => textToScan.includes(kw))
  if (on_site_required) {
    match_score = Math.round(match_score * ON_SITE_SUPPRESSION_MULTIPLIER)
  }

  // best_category can never be 'technical' any more (see the loop above), so
  // the old "senior technical, scored down" message can't fire — technical
  // postings are dropped entirely at push time instead, not shown with an
  // explanatory score.
  const experience_match_summary = clearance_required
    ? 'Requires U.S. government clearance/citizenship verification — deprioritized.'
    : on_site_required
      ? 'Posting text says on-site/office-based despite being listed as remote — deprioritized.'
      : best_category
        ? `${category_scores[best_category]}% coverage of your ${CATEGORY_LABEL[best_category]} skills (${matchedSkills.length} matched).`
        : `Matches ${matchedSkills.length} key skills in your profile.`

  const why_fits = clearance_required
    ? 'Needs a security clearance or US-citizen verification most applicants cannot get.'
    : on_site_required
      ? 'Not actually remote — the listing requires being on-site/in-office.'
      : matchedSkills.length > 0
        ? `Strong keyword overlap with: ${matchedSkills.join(', ')}.`
        : `Low keyword overlap. ${isNiche ? 'Flagged as potential niche/unconventional role.' : ''}`.trim()

  return {
    ...job,
    match_score,
    category_scores,
    best_category,
    key_skills_match: matchedSkills,
    experience_match_summary,
    why_fits,
    niche_flag: isNiche && match_score < 40,
    remote_flag,
    clearance_required,
    on_site_required,
  }
}
