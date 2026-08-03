import { NextResponse } from 'next/server'

export function checkAuth(req: Request) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.INTERNAL_API_SECRET

  if (!secret) {
    console.error('INTERNAL_API_SECRET is not set in environment variables.')
    return false
  }

  if (authHeader !== `Bearer ${secret}`) {
    return false
  }

  return true
}
