import { NextResponse } from 'next/server'
import { loadProfile, saveProfile } from '@/lib/resume/store'
import { sanitizeProfile } from '@/lib/resume/profile-extractor'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const stored = await loadProfile()
    return NextResponse.json({
      success: true,
      profile: stored?.data ?? null,
      filename: stored?.source_filename ?? null,
      updatedAt: stored?.updated_at ?? null,
    })
  } catch (err: any) {
    console.error('[resume/profile GET]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Save the profile the user has reviewed. Runs the same sanitizer as extraction
// so a hand-edited payload cannot introduce a shape the tailor engine will
// choke on, then stamps it verified.
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    if (!body?.profile) {
      return NextResponse.json({ error: 'Expected { profile }.' }, { status: 400 })
    }

    const profile = sanitizeProfile(body.profile)
    profile.verification = body.verified === false ? 'extracted' : 'verified'

    const stored = await saveProfile(profile, body.filename)
    return NextResponse.json({ success: true, profile: stored.data, updatedAt: stored.updated_at })
  } catch (err: any) {
    console.error('[resume/profile PUT]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
