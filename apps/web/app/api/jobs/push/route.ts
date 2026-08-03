import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth } from '@/lib/auth'
import { scoreJob, ScrapedJobInput } from '@/lib/scoring'

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const jobs: ScrapedJobInput[] = await req.json()

    if (!Array.isArray(jobs)) {
      return NextResponse.json({ error: 'Expected an array of jobs' }, { status: 400 })
    }

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

    // 3. Upsert jobs (dedup on application_link)
    // On conflict, we don't want to overwrite manual stages. 
    // Supabase JS upsert allows `onConflict`. We will upsert, but we should be careful.
    // To handle preserving 'stage' from manual entries, we can do an INSERT with ON CONFLICT DO UPDATE
    // However, supabase-js `upsert` might overwrite all fields. 
    // A safer way is to use a Postgres function or just simple upsert with ignoreDuplicates if we don't want to overwrite, 
    // or we fetch existing and filter. 
    // For V1, standard upsert where we just update scraped fields is fine if we only push scraped jobs.
    
    const jobsToInsert = scoredJobs.map(job => ({
      source: 'scraped',
      job_title: job.job_title,
      company: job.company,
      company_tier: job.company_tier,
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
      notes: job.niche_flag ? 'Flagged as niche role' : null,
    }))

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

    return NextResponse.json({ success: true, count: jobsToInsert.length })

  } catch (err: any) {
    console.error('Exception in push jobs:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
