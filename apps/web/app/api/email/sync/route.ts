import { NextResponse } from 'next/server'
import { syncEmails } from '@/lib/email-tracker'

// This endpoint can be hit via Vercel Cron or directly
export async function GET(req: Request) {
  try {
    // Optional: Add a simple auth token check if we are calling this via cron
    // const authHeader = req.headers.get('authorization')
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 })
    // }

    const result = await syncEmails()
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Email Sync Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
