import { NextResponse } from 'next/server'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { supabaseAdmin } from '@/lib/supabase'
import { loadProfile, loadLatestSessionForJob } from '@/lib/resume/store'
import { applyChanges } from '@/lib/resume/apply'
import { generatePdf } from '@/lib/resume/pdf-generator'

export const runtime = 'nodejs'
export const maxDuration = 60

const APPLY_FILL_SERVICE_URL = 'http://localhost:8790/apply-fill'

// Only reachable when this route runs on the same machine as apply-fill-service
// (i.e. the local dev server, not the Vercel deployment) — the service opens a
// real, visible browser window on the host desktop, which only makes sense
// when "the host" is the person's own PC.
function deriveLinks(links: string[]) {
  const linkedin = links.find((l) => l.toLowerCase().includes('linkedin.com')) ?? ''
  const github = links.find((l) => l.toLowerCase().includes('github.com')) ?? ''
  const portfolio = links.find((l) => l !== linkedin && l !== github) ?? ''
  return { linkedin, github, portfolio }
}

function normalizeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export async function POST(req: Request) {
  try {
    const { job_id } = await req.json()
    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('application_link, job_title, company')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const stored = await loadProfile()
    if (!stored?.data) {
      return NextResponse.json({ error: 'No career profile saved yet — fill it in on /profile first.' }, { status: 409 })
    }

    // Best available resume: a tailored one for this job if it exists, else
    // the base profile — same precedence /api/resume/generate already uses.
    let profile = stored.data
    const session = await loadLatestSessionForJob(job_id)
    if (session) {
      profile = applyChanges(profile, session.changes)
    }

    const pdfBuffer = await generatePdf(profile)
    const tempPath = path.join(os.tmpdir(), `apply-fill-${job_id}.pdf`)
    await fs.writeFile(tempPath, pdfBuffer)

    const { linkedin, github, portfolio } = deriveLinks(profile.personal.links ?? [])

    const serviceRes = await fetch(APPLY_FILL_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: normalizeUrl(job.application_link),
        profile: {
          name: profile.personal.name,
          email: profile.personal.email,
          phone: profile.personal.phone,
          location: profile.personal.location,
          linkedin,
          github,
          portfolio,
        },
        resume_path: tempPath,
      }),
    })

    if (!serviceRes.ok) {
      const text = await serviceRes.text()
      return NextResponse.json(
        { error: `apply-fill-service unreachable or errored: ${text}. Is it running (localhost:8790)? This only works from the local dev server, not the Vercel deployment.` },
        { status: 502 }
      )
    }

    const result = await serviceRes.json()
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[jobs/apply-fill]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
