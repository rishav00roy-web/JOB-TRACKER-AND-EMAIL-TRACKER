import { NextResponse } from 'next/server'
import { loadProfile, loadSession } from '@/lib/resume/store'
import { applyChanges, resumeFilename } from '@/lib/resume/apply'
import { generateDocx } from '@/lib/resume/docx-generator'
import { generatePdf } from '@/lib/resume/pdf-generator'

export const runtime = 'nodejs'
export const maxDuration = 60

// Build the tailored document. The profile always comes from the database and
// the accepted changes are re-applied server-side, so the exported file cannot
// contain anything the client made up in between.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const format: 'pdf' | 'docx' = body?.format === 'pdf' ? 'pdf' : 'docx'

    const stored = await loadProfile()
    if (!stored?.data) {
      return NextResponse.json({ error: 'No career profile saved yet.' }, { status: 409 })
    }

    let profile = stored.data
    let jobTitle = ''

    if (body?.session_id) {
      const session = await loadSession(body.session_id)
      if (!session) return NextResponse.json({ error: 'Tailoring session not found.' }, { status: 404 })
      profile = applyChanges(profile, session.changes)
      jobTitle = session.jobTitle
    }

    const buffer = format === 'pdf' ? await generatePdf(profile) : await generateDocx(profile)
    const filename = resumeFilename(profile, jobTitle, format)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err: any) {
    console.error('[resume/generate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
