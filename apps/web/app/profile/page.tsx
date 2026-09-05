import { loadProfile } from '@/lib/resume/store'
import { ProfileEditor } from '@/components/profile-editor'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  let stored = null
  let error: string | null = null

  try {
    stored = await loadProfile()
  } catch (err: any) {
    error = err.message
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-card/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="font-mono text-muted-foreground hover:text-primary" nativeButton={false} render={<a href="/" />}>
            ← Board
          </Button>
          <h1 className="font-semibold tracking-tight text-foreground">Career Profile</h1>
        </div>
        <span className="text-sm text-muted-foreground hidden sm:inline">Verified facts. Nothing invented.</span>
      </header>

      {error ? (
        <div role="alert" className="m-6 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-5 py-4">
          <p className="font-semibold mb-1">Couldn&apos;t load your profile</p>
          <p className="text-destructive/80">{error}</p>
          <p className="text-muted-foreground mt-2 text-xs font-mono">
            Have you run migration-resume-tailor.sql in the Supabase SQL editor?
          </p>
        </div>
      ) : (
        <ProfileEditor initialProfile={stored?.data ?? null} initialFilename={stored?.source_filename ?? null} />
      )}
    </main>
  )
}
