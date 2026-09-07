import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth } from '@/lib/auth'
import { scoreJob, ScrapedJobInput } from '@/lib/scoring'

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
    const scoredJobs = jobs.map(job => scoreJob(job, skills || []))

    // 2b. Company page lookup, deduped by company name across the batch.
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

    // 3. Upsert jobs (dedup on application_link)
    // On conflict, we don't want to overwrite manual stages. 
    // Supabase JS upsert allows `onConflict`. We will upsert, but we should be careful.
    // To handle preserving 'stage' from manual entries, we can do an INSERT with ON CONFLICT DO UPDATE
    // However, supabase-js `upsert` might overwrite all fields. 
    // A safer way is to use a Postgres function or just simple upsert with ignoreDuplicates if we don't want to overwrite, 
    // or we fetch existing and filter. 
    // For V1, standard upsert where we just update scraped fields is fine if we only push scraped jobs.
    
    const jobsToInsert = scoredJobs.map(job => {
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
      .upsert(jobsToInsert, { 
        onConflict: 'application_link',
        // In a real scenario to preserve stage we'd map fields to update. 
        // For now, Supabase upsert updates provided fields. We don't provide 'stage', so it should default or keep existing.
      })

    if (insertError) {
      console.error('Error inserting jobs:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: jobsToInsert.length, filtered_stale: filteredStale })

  } catch (err: any) {
    console.error('Exception in push jobs:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
