import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="w-12 h-12 rounded-md bg-primary/12 flex items-center justify-center ring-1 ring-primary/20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">404</p>
          <h1 className="text-lg font-semibold text-foreground mt-1">This page isn&apos;t on the board</h1>
          <p className="text-sm text-muted-foreground mt-2">No listing, no route — nothing here to track.</p>
        </div>
        <Button variant="outline" className="font-mono uppercase tracking-wide text-primary border-primary/25 hover:bg-primary/10" nativeButton={false} render={<a href="/" />}>
          ← Back to board
        </Button>
      </div>
    </main>
  )
}
