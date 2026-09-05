import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { tailor } from '@/lib/resume/tailor-engine'
import { loadProfile, loadLatestSessionForJob, saveSession, updateSessionChanges } from '@/lib/resume/store'
import type { TailorMode } from '@/lib/resume/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODES: TailorMode[] = ['conservative', 'balanced', 'strong']

// Resume an existing review: GET ?job_id=... returns the latest session for a
// job so accept/reject state survives a page reload.
export async function GET(req: Request) {
  try {
    const jobId = new URL(req.url).searchParams.get('job_id')
    if (!jobId) return NextResponse.json({ error: 'Expected ?job_id=' }, { status: 400 })

    const session = await loadLatestSessionForJob(jobId)
    return NextResponse.json({ success: true, session })
  } catch (err: any) {
    console.error('[resume/tailor GET]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Run a tailoring pass. The JD comes from the job row when job_id is given,
// with an explicit job_description overriding it — scraped rows predating the
// description column have nothing stored, so pasting must still work.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const mode: TailorMode = MODES.includes(body?.mode) ? body.mode : 'balanced'
    const jobId: string | null = typeof body?.job_id === 'string' ? body.job_id : null

    const stored = await loadProfile()
    if (!stored?.data) {
      return NextResponse.json(
        { error: 'No career profile saved yet. Upload a resume on the Profile page first.' },
        { status: 409 }
      )
    }

    let jobDescription: string = typeof body?.job_description === 'string' ? body.job_description.trim() : ''

    if (!jobDescription && jobId) {
      const { data: job, error } = await supabaseAdmin
        .from('jobs')
        .select('description, job_title, company')
        .eq('id', jobId)
        .maybeSingle()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

      jobDescription = (job.description || '').trim()
      if (!jobDescription) {
        return NextResponse.json(
          {
            error: `No description stored for "${job.job_title}" at ${job.company}. Paste the job description to tailor against it.`,
            needsDescription: true,
          },
          { status: 409 }
        )
      }
    }

    if (jobDescription.length < 80) {
      return NextResponse.json({ error: 'That job description is too short to tailor against.' }, { status: 400 })
    }

    // A pasted description is worth keeping on the job row for next time.
    if (jobId && typeof body?.job_description === 'string' && body.job_description.trim()) {
      await supabaseAdmin.from('jobs').update({ description: jobDescription }).eq('id', jobId)
    }

    const result = await tailor(stored.data, jobDescription, mode)
    const session = await saveSession({ jobId, jobDescription, mode, result })

    return NextResponse.json({ success: true, session })
  } catch (err: any) {
    console.error('[resume/tailor POST]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Persist accept/reject/edit decisions on a session's changes.
export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    if (!body?.session_id || !Array.isArray(body?.changes)) {
      return NextResponse.json({ error: 'Expected { session_id, changes }.' }, { status: 400 })
    }

    await updateSessionChanges(body.session_id, body.changes)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[resume/tailor PATCH]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
