import { supabaseAdmin } from '@/lib/supabase'
import { KanbanBoard } from '@/components/kanban-board'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data: jobs, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .order('match_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-8 text-red-500">
        Error loading jobs: {error.message}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center border border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <h1 className="font-semibold tracking-tight text-white">Agentic Job Tracker</h1>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <span className="text-muted-foreground">Scraped & scored natively.</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <KanbanBoard initialJobs={jobs || []} />
      </div>
    </main>
  )
}
