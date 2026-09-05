import { NextResponse } from 'next/server'
import { extractResumeText, UnsupportedResumeFileError } from '@/lib/resume/parse'
import { extractProfileFromResumeText } from '@/lib/resume/profile-extractor'
import { AiNotConfiguredError } from '@/lib/resume/ai'

// pdf-parse and mammoth both need the Node runtime, not Edge.
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024

// Upload a resume, get back an EXTRACTED profile. Deliberately does not save:
// the profile is unverified until the user confirms it in the review UI and
// PUTs it to /api/resume/profile.
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Expected a multipart form with a "file" field.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Limit is 8MB.` },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractResumeText(buffer, file.name)
    const profile = await extractProfileFromResumeText(text)

    return NextResponse.json({ success: true, profile, filename: file.name, characters: text.length })
  } catch (err: any) {
    if (err instanceof UnsupportedResumeFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    console.error('[resume/parse]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
