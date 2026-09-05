// (verified profile + job description) -> tailoring session.
//
// The model is asked to follow the truthfulness rules, and then every change it
// returns is re-checked here against the real profile before it is allowed
// through. A change whose "original" is not verbatim-identical to an actual
// bullet is dropped, not trusted. That check is the whole point: it makes
// "don't invent things" an invariant in code rather than a request.

import { callChatCompletionWithRetry, hasApiKey } from './ai'
import { extractJsonObject } from './extract-json'
import type { CareerProfile, TailorChange, TailorMode, TailorResult } from './types'

const SYSTEM_PROMPT = `You are a resume-tailoring engine. You are given a candidate's VERIFIED career profile as JSON and a job description. Produce truthful, evidence-based resume tailoring suggestions.

STRICT RULES (never violate):
- Never invent skills, projects, certifications, achievements, or measurements that are not present in the profile JSON.
- Never propose changing company names, job titles, employment dates, or education/degrees.
- Every "original" field in a change must be copied verbatim (exact text) from the profile: either a bullet's "text" or the summary's "text", identified by targetBulletId ("summary" for the summary).
- Every "evidence" field must cite the specific fact in the profile that justifies the change.
- Do not keyword-stuff. Only add a keyword to a bullet if the underlying work already verifiably involved it per the profile's technologies/skills lists.
- matchBefore and matchAfter are integers 0-100 describing an "Estimated Resume Relevance", not a real ATS score. Be conservative and explainable.
- If there is no truthful way to strengthen a bullet for this job description, return an empty changes array rather than fabricating one.

Respond with ONLY a single JSON object, no markdown code fences, no prose before or after, matching exactly this shape:
{
  "jobTitle": string,
  "matchBefore": number,
  "matchAfter": number,
  "strongMatches": string[],
  "stillMissing": [{"skill": string, "note": string}],
  "changes": [{
    "id": string, "section": string, "company": string, "bulletLabel": string,
    "targetBulletId": string, "original": string, "updated": string,
    "keywordsAdded": string[], "keywordsRemoved": string[], "reason": string, "evidence": string
  }],
  "keywords": [{"keyword": string, "importance": "Required" or "Preferred", "before": number, "after": number, "location": string, "status": "Verified" or "Unverified" or "Not found"}]
}`

const MODE_INSTRUCTIONS: Record<TailorMode, string> = {
  conservative:
    'Conservative mode: propose the fewest possible changes, touching only bullets that map to explicitly REQUIRED job skills already verified in the profile.',
  balanced:
    'Balanced mode: strengthen bullets for both required and preferred skills that are verified in the profile.',
  strong:
    'Strong Targeting mode: also strengthen the professional summary using verified specialties, in addition to required and preferred skills.',
}

function buildUserPrompt(profile: CareerProfile, jobDescriptionText: string, mode: TailorMode) {
  const modeInstruction = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.balanced
  return [
    `CAREER PROFILE (verified facts only):\n${JSON.stringify(profile)}`,
    `JOB DESCRIPTION:\n${jobDescriptionText}`,
    `TAILORING MODE: ${mode}. ${modeInstruction}`,
    'Respond with only the JSON object described in the system prompt.',
  ].join('\n\n')
}

// Every rewritable unit in the profile, keyed by id. Anything not in here
// cannot be the target of a change.
function collectBulletIndex(profile: CareerProfile) {
  const index = new Map<string, string>()
  if (profile.summary?.text) index.set('summary', profile.summary.text)
  for (const exp of profile.experience || []) {
    for (const b of exp.bullets || []) index.set(b.id, b.text)
  }
  return index
}

const clampPct = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))

export function validateAndSanitize(raw: string, profile: CareerProfile): TailorResult {
  let parsed: Record<string, any>
  try {
    parsed = extractJsonObject(raw) as Record<string, any>
  } catch (e: any) {
    console.error('[tailorEngine] Failed to parse AI response:', e.message)
    console.error('[tailorEngine] Full raw response:\n', raw)
    throw new Error('The AI response was not valid JSON. Check the server logs for the raw response.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The AI response was not a JSON object.')
  }

  const bulletIndex = collectBulletIndex(profile)
  const rawChanges: any[] = Array.isArray(parsed.changes) ? parsed.changes : []

  const safeChanges: TailorChange[] = rawChanges
    .filter((c: any) => {
      if (!c || typeof c !== 'object') return false
      // Target must be a real bullet...
      if (!c.targetBulletId || !bulletIndex.has(c.targetBulletId)) return false
      // ...and "original" must be that bullet, verbatim. This is what stops a
      // hallucinated "existing" bullet from reaching the review UI.
      const realOriginal = bulletIndex.get(c.targetBulletId)!
      if (typeof c.original !== 'string' || c.original.trim() !== realOriginal.trim()) return false
      if (typeof c.updated !== 'string' || !c.updated.trim()) return false
      return true
    })
    .map((c: any, i: number) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `ai-${i}-${c.targetBulletId}`,
      section: typeof c.section === 'string' ? c.section : 'Experience',
      company: typeof c.company === 'string' ? c.company : '',
      bulletLabel: typeof c.bulletLabel === 'string' ? c.bulletLabel : '',
      targetBulletId: c.targetBulletId,
      original: c.original,
      updated: c.updated,
      keywordsAdded: Array.isArray(c.keywordsAdded) ? c.keywordsAdded.filter((k: unknown) => typeof k === 'string') : [],
      keywordsRemoved: Array.isArray(c.keywordsRemoved)
        ? c.keywordsRemoved.filter((k: unknown) => typeof k === 'string')
        : [],
      reason: typeof c.reason === 'string' ? c.reason : '',
      evidence: typeof c.evidence === 'string' ? c.evidence : '',
      status: 'pending' as const,
    }))

  const dropped = rawChanges.length - safeChanges.length
  if (dropped > 0) {
    console.warn(`[tailorEngine] Dropped ${dropped} change(s) that did not match the profile verbatim.`)
  }

  const validStatuses = ['Verified', 'Unverified', 'Not found']

  return {
    jobTitle: typeof parsed.jobTitle === 'string' && parsed.jobTitle ? parsed.jobTitle : 'Untitled Role',
    matchBefore: clampPct(parsed.matchBefore),
    matchAfter: clampPct(parsed.matchAfter),
    strongMatches: Array.isArray(parsed.strongMatches)
      ? parsed.strongMatches.filter((s: unknown) => typeof s === 'string')
      : [],
    stillMissing: Array.isArray(parsed.stillMissing)
      ? parsed.stillMissing
          .filter((g: any) => g && typeof g.skill === 'string')
          .map((g: any) => ({ skill: g.skill, note: typeof g.note === 'string' ? g.note : '' }))
      : [],
    changes: safeChanges,
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k: any) => k && typeof k.keyword === 'string')
          .map((k: any) => ({
            keyword: k.keyword,
            importance: k.importance === 'Preferred' ? ('Preferred' as const) : ('Required' as const),
            before: Number.isFinite(Number(k.before)) ? Number(k.before) : 0,
            after: Number.isFinite(Number(k.after)) ? Number(k.after) : 0,
            location: typeof k.location === 'string' ? k.location : 'Not added',
            status: validStatuses.includes(k.status) ? k.status : 'Not found',
          }))
      : [],
    engine: 'ai',
  }
}

export async function tailorWithAI(
  profile: CareerProfile,
  jobDescriptionText: string,
  mode: TailorMode
): Promise<TailorResult> {
  const content = await callChatCompletionWithRetry([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(profile, jobDescriptionText, mode) },
  ])
  return validateAndSanitize(content, profile)
}

export async function tailor(
  profile: CareerProfile,
  jobDescriptionText: string,
  mode: TailorMode
): Promise<TailorResult> {
  if (!hasApiKey()) return tailorLocally(profile, jobDescriptionText)
  return tailorWithAI(profile, jobDescriptionText, mode)
}

// ---------------------------------------------------------------------------
// Local fallback, used when no OPENROUTER_API_KEY is set.
//
// It reports gaps and keyword coverage but proposes ZERO changes: rewriting a
// bullet truthfully needs judgement this engine does not have, and inventing
// one would break the guarantee the whole feature rests on. So matchAfter
// equals matchBefore here, honestly.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'this', 'that', 'from', 'your', 'their', 'who',
  'all', 'can', 'has', 'work', 'team', 'role', 'job', 'about', 'they', 'been', 'more', 'other', 'into', 'than', 'then',
  'them', 'was', 'were', 'not', 'but', 'its', 'out', 'via', 'per', 'use', 'using', 'used', 'also', 'may', 'must',
  'should', 'would', 'could', 'across', 'within', 'while', 'years', 'year', 'experience', 'including', 'ability',
])

function tokenize(text: string) {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) || []).filter((t) => !STOPWORDS.has(t))
}

function profileCorpus(profile: CareerProfile) {
  const parts: string[] = [profile.summary?.text || '', ...(profile.skills || [])]
  for (const e of profile.experience || []) {
    parts.push(e.title, ...(e.technologies || []), ...(e.bullets || []).map((b) => b.text))
  }
  for (const c of profile.certifications || []) parts.push(c.name)
  return parts.join(' ').toLowerCase()
}

export function tailorLocally(profile: CareerProfile, jobDescriptionText: string): TailorResult {
  const corpus = profileCorpus(profile)
  const jdTokens = tokenize(jobDescriptionText)

  // Frequency in the JD is a decent proxy for how much the posting cares.
  const freq = new Map<string, number>()
  for (const t of jdTokens) freq.set(t, (freq.get(t) || 0) + 1)

  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)

  const keywords = ranked.map(([keyword, count]) => {
    const present = corpus.includes(keyword)
    return {
      keyword,
      importance: count >= 3 ? ('Required' as const) : ('Preferred' as const),
      before: present ? 1 : 0,
      after: present ? 1 : 0,
      location: present ? 'Already in profile' : 'Not added',
      status: present ? ('Verified' as const) : ('Not found' as const),
    }
  })

  const hits = keywords.filter((k) => k.status === 'Verified')
  const matchBefore = keywords.length ? Math.round((hits.length / keywords.length) * 100) : 0

  const firstLine = jobDescriptionText.split('\n').find((l) => l.trim())

  return {
    jobTitle: firstLine ? firstLine.trim().slice(0, 120) : 'Untitled Role',
    matchBefore,
    matchAfter: matchBefore,
    strongMatches: hits.slice(0, 10).map((k) => k.keyword),
    stillMissing: keywords
      .filter((k) => k.status === 'Not found' && k.importance === 'Required')
      .slice(0, 10)
      .map((k) => ({ skill: k.keyword, note: 'Not found anywhere in your verified profile.' })),
    changes: [],
    keywords,
    engine: 'local',
  }
}
