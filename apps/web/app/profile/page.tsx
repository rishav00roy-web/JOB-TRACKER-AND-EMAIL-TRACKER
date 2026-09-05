import Link from 'next/link'
import { loadProfile } from '@/lib/resume/store'
import { ProfileEditor } from '@/components/profile-editor'

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
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-primary transition-colors text-sm font-mono rounded-sm active:scale-[0.96]"
          >
            ← Board
          </Link>
          <h1 className="font-semibold tracking-tight text-foreground">Career Profile</h1>
        </div>
        <span className="text-sm text-muted-foreground">Verified facts. Nothing invented.</span>
      </header>

      {error ? (
        <div className="p-8 text-destructive text-sm">
          Error loading profile: {error}
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
