import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth } from '@/lib/auth'
import { scoreJob, ScrapedJobInput, ScoredJobResult } from '@/lib/scoring'
import { hasApiKey, callChatCompletionWithRetry } from '@/lib/resume/ai'

// Indeed's redirect links (/rc/clk?jk=...&bb=...) carry a fresh tracking
// token on every page load — the `jk` param is the only stable part, so the
// same real posting scraped on two different runs produces two "different"
// URLs and defeats dedup entirely. Collapse to Indeed's own canonical
// /viewjob?jk=... form, which is both stable and a real permalink.
function canonicalizeApplicationLink(link: string): string {
  try {
    const url = new URL(link)
    if (url.hostname.includes('indeed.com') && url.searchParams.has('jk')) {
      return `https://${url.hostname}/viewjob?jk=${url.searchParams.get('jk')}`
    }
  } catch {
    // not a parseable URL — leave it as-is, scoring/insert will handle it
  }
  return link
}

// Kept on the same free-tier model the n8n extraction branches already use
// (proven reliable there: fast, clean JSON). Deliberately NOT left to
// lib/resume/ai's default model — that default is a paid OpenRouter model
// (anthropic/claude-sonnet-4.5) meant for the tailor feature's occasional,
// user-initiated calls. Running that against every scraped job automatically
// would turn an unattended daily cron into a real, uncapped per-token bill
// nobody explicitly approved. This stage shares extraction's existing free
// 50/day OpenRouter budget rather than opening a new spending surface.
const JD_CHECK_MODEL = 'liquid/lfm-2.5-2.6b:free'

const CANDIDATE_PROFILE =
  'The candidate is early-career and largely self-taught, building web apps with AI coding tools ' +
  '(Claude Code, Antigravity) rather than working as an unaided professional software engineer. ' +
  'They are not looking for hands-on software engineering / coding roles at any level, including ' +
  '"AI engineer" titles that are really SWE roles in disguise. They want either (a) non-technical ' +
  'roles (ops, support, admin, research, writing, sales, community, enablement, etc.) where AI ' +
  'fluency is a bonus/differentiator rather than the core job, or (b) genuine AI-generalist roles ' +
  '(AI training, data annotation, model evaluation, prompt writing, AI content review) that do not ' +
  'require a CS/engineering background. They are open to remote work from any country/timezone and ' +
  'hold no security clearance or US citizenship.'

// Stage-2 filter, LLM-backed: keyword scoring alone can't tell "AI Content
// Reviewer" (wanted) from "AI Engineer" that's secretly a backend role
// (not wanted), can't read a buried "10+ years required," and can't catch
// "remote" postings that actually require a specific country/timezone.
// Deliberately called only on jobs that already passed the free filters
// above (freshness, category match, not-technical) — the expense scales
// with "plausible candidates," not raw scrape volume. Fails open on any
// error (no key, 429, timeout, bad JSON): a bad OpenRouter day should
// degrade to today's keyword-only behavior, not silently empty the board.
async function jdSanityCheck(job: ScoredJobResult): Promise<{ keep: boolean; reason: string }> {
  try {
    const content = await callChatCompletionWithRetry(
      [
        {
          role: 'system',
          content:
            `You screen job postings for one specific candidate. ${CANDIDATE_PROFILE} ` +
            'Given a job title and its full description, decide if it is worth showing them. ' +
            'Drop it if: it actually requires hands-on coding/engineering as a core function ' +
            'regardless of title; it sets a seniority/experience bar clearly beyond early-career ' +
            '(e.g. "10+ years", "expert-level", "must have shipped production ML systems"); or it ' +
            'has a real location/citizenship/timezone restriction despite claiming remote. ' +
            'Otherwise keep it. Respond with strict JSON only: {"keep": boolean, "reason": "one short sentence"}.',
        },
        {
          role: 'user',
          content: `Title: ${job.job_title}\n\nDescription:\n${(job.description || '').slice(0, 6000)}`,
        },
      ],
      { json: true, model: JD_CHECK_MODEL }
    )
    const parsed = JSON.parse(content)
    return { keep: parsed.keep !== false, reason: String(parsed.reason || '') }
  } catch {
    return { keep: true, reason: '' }
  }
}

// One Firecrawl search per unique company in the batch, not per job — a
// batch of 200 jobs is usually well under 200 distinct companies, and
// looking up the same company twice would just burn free-tier quota for
// an answer already known.
async function lookupCompanyUrl(company: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key || !company) return null
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${company} official website`, limit: 1 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.web?.[0]?.url ?? null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawJobs: ScrapedJobInput[] = await req.json()

    if (!Array.isArray(rawJobs)) {
      return NextResponse.json({ error: 'Expected an array of jobs' }, { status: 400 })
    }

    for (const job of rawJobs) {
      job.application_link = canonicalizeApplicationLink(job.application_link)
    }

    // Freshness cutoff. Only enforceable where a source actually reports a
    // real posted_date (JobSpy, RemoteOK, WWR all do). Firecrawl/Scrapling's
    // LLM-extraction step has no date field in its output schema, so a job
    // with no parseable posted_date is let through rather than dropped —
    // filtering on data that doesn't exist would just silently lose those
    // branches' output, which is worse than not filtering them yet.
    const FRESHNESS_DAYS = 2
    const now = Date.now()
    let filteredStale = 0
    const jobs = rawJobs.filter((job) => {
      if (!job.posted_date) return true
      const parsed = new Date(job.posted_date)
      if (Number.isNaN(parsed.getTime())) return true
      const isFresh = now - parsed.getTime() <= FRESHNESS_DAYS * 24 * 60 * 60 * 1000
      if (!isFresh) filteredStale++
      return isFresh
    })

    // 1. Fetch current skills
    const { data: skills, error: skillsError } = await supabaseAdmin
      .from('skills')
      .select('*')

    if (skillsError) {
      console.error('Error fetching skills:', skillsError)
      return NextResponse.json({ error: 'Database error fetching skills' }, { status: 500 })
    }

    // 2. Score jobs
    const allScoredJobs = jobs.map(job => scoreJob(job, skills || []))

    // No skill-category overlap at all means the posting shares literally
    // nothing with the profile — not a low score, no signal. Keeping these
    // was most of the board's noise (114 of 158 jobs at one point had zero
    // category match). Drop before the company lookup so nothing gets
    // spent looking up a company for a job about to be discarded.
    const droppedNoMatch = allScoredJobs.length - allScoredJobs.filter((j) => j.best_category !== null).length
    const categoryMatchedJobs = allScoredJobs.filter((j) => j.best_category !== null)

    // 2b. LLM JD sanity check (see jdSanityCheck above) — skipped outright,
    // not just fail-open per-job, when no key is configured at all.
    let droppedByJdCheck = 0
    const jdCheckSkipped = !hasApiKey()
    let scoredJobs = categoryMatchedJobs
    if (!jdCheckSkipped) {
      const CONCURRENCY_JD = 5
      const verdicts: { keep: boolean; reason: string }[] = []
      for (let i = 0; i < categoryMatchedJobs.length; i += CONCURRENCY_JD) {
        const batch = categoryMatchedJobs.slice(i, i + CONCURRENCY_JD)
        const results = await Promise.all(batch.map((j) => jdSanityCheck(j)))
        verdicts.push(...results)
      }
      scoredJobs = categoryMatchedJobs.filter((_, idx) => verdicts[idx]!.keep)
      droppedByJdCheck = categoryMatchedJobs.length - scoredJobs.length
    }

    // 2c. Company page lookup, deduped by company name across the batch.
    // Throttled to 5 concurrent — a batch this size can easily mean 100+
    // unique companies, and firing them all at once would trip Firecrawl's
    // free-tier rate limit rather than just being slow.
    const uniqueCompanies = [...new Set(scoredJobs.map((j) => j.company).filter(Boolean))]
    const companyUrlMap = new Map<string, string | null>()
    const CONCURRENCY = 5
    for (let i = 0; i < uniqueCompanies.length; i += CONCURRENCY) {
      const batch = uniqueCompanies.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map((c) => lookupCompanyUrl(c)))
      batch.forEach((c, idx) => companyUrlMap.set(c, results[idx] ?? null))
    }

    // Upsert on application_link. Deliberately omits `stage`, so a re-push of
    // an already-tracked job updates its scraped fields without disturbing
    // wherever the user has moved it on the board.
    const jobsToInsert = scoredJobs.map((job) => {
      const companyUrl = companyUrlMap.get(job.company) ?? null
      return {
        source: 'scraped',
        job_title: job.job_title,
        company: job.company,
        company_url: companyUrl,
        // A resolvable official domain is a real legitimacy signal — used
        // heavily by ghost-job farms and low-effort postings that companies
        // with an actual website/footprint don't share.
        company_tier: companyUrl ? job.company_tier ?? 'Verified domain found' : job.company_tier ?? 'No domain found',
        location: job.location,
        work_type: job.work_type,
        posted_date: job.posted_date,
        match_score: job.match_score,
        experience_match_summary: job.experience_match_summary,
        key_skills_match: job.key_skills_match,
        why_fits: job.why_fits,
        application_link: job.application_link,
        easy_apply: job.easy_apply,
        compensation_insight: job.compensation_insight,
        // Kept so the resume tailorer has JD text to work against later; a
        // posting is usually gone by the time you want to re-read it.
        description: job.description,
        niche_flag: job.niche_flag,
        remote_flag: job.remote_flag,
        clearance_required: job.clearance_required,
        on_site_required: job.on_site_required,
        category_scores: job.category_scores,
        best_category: job.best_category,
        notes: job.clearance_required
          ? 'Requires US clearance/citizenship — deprioritized'
          : job.on_site_required
            ? 'Not actually remote — on-site/office-based'
            : job.niche_flag
              ? 'Flagged as niche role'
              : null,
      }
    })

    const { error: insertError } = await supabaseAdmin
      .from('jobs')
      .upsert(jobsToInsert, { onConflict: 'application_link' })

    if (insertError) {
      console.error('Error inserting jobs:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: jobsToInsert.length,
      filtered_stale: filteredStale,
      dropped_no_category_match: droppedNoMatch,
      dropped_by_jd_check: droppedByJdCheck,
      jd_check_skipped: jdCheckSkipped,
    })

  } catch (err: any) {
    console.error('Exception in push jobs:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
