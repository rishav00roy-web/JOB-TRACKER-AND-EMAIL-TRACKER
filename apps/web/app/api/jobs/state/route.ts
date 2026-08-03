import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth } from '@/lib/auth'

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get count of jobs by stage
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('stage')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const state = {
      wishlist: 0,
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      total: data.length
    }

    data.forEach(row => {
      if (row.stage in state) {
        state[row.stage as keyof typeof state]++
      }
    })

    return NextResponse.json({ success: true, state })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
