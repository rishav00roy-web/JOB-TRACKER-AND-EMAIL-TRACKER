import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth } from '@/lib/auth'

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const job = await req.json()

    if (!job.application_link || !job.job_title || !job.company) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const jobToInsert = {
      source: 'manual',
      stage: 'applied', // Default for manual logging
      job_title: job.job_title,
      company: job.company,
      location: job.location,
      work_type: job.work_type,
      posted_date: job.posted_date || new Date().toISOString(),
      application_link: job.application_link,
      priority_level: job.priority_level || 'Medium',
      notes: job.notes,
    }

    const { error: insertError } = await supabaseAdmin
      .from('jobs')
      .upsert(jobToInsert, { onConflict: 'application_link' })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
