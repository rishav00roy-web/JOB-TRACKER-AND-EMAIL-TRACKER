import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { KanbanBoard } from '@/components/kanban-board'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data: rows, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .order('match_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  // The board only needs to know whether a description exists, not what it
  // says — shipping every full JD to the client would bloat the payload.
  const jobs = (rows || []).map(({ description, ...job }) => ({
    ...job,
    description: description ? 'stored' : null,
  }))

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-5 py-4">
          <p className="font-semibold mb-1">Couldn&apos;t load the board</p>
          <p className="text-destructive/80">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center border border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <h1 className="font-semibold tracking-tight text-foreground">Agentic Job Tracker</h1>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <span className="text-muted-foreground hidden sm:inline">Scraped &amp; scored natively.</span>
          <Link
            href="/profile"
            className="text-xs font-mono uppercase tracking-wider text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/50 px-3 py-1.5 rounded-lg transition-colors active:scale-[0.96]"
          >
            Career Profile
          </Link>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <KanbanBoard initialJobs={jobs || []} />
      </div>
    </main>
  )
}
