import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="w-12 h-12 rounded-md bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center border border-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">404</p>
          <h1 className="text-lg font-semibold text-foreground mt-1">This page isn&apos;t on the board</h1>
          <p className="text-sm text-muted-foreground mt-2">
            No listing, no route — nothing here to track.
          </p>
        </div>
        <Link
          href="/"
          className="text-xs font-mono uppercase tracking-wider text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/50 px-4 py-2 rounded-lg transition-colors active:scale-[0.96]"
        >
          ← Back to board
        </Link>
      </div>
    </main>
  )
}
