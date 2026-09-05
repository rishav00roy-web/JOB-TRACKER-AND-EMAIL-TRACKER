'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TailorChange, TailorMode, TailorResult } from '@/lib/resume/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'

type Session = TailorResult & { id: string; job_description: string }

const MODES: { value: TailorMode; label: string; hint: string }[] = [
  { value: 'conservative', label: 'Conservative', hint: 'Only bullets matching explicitly required skills.' },
  { value: 'balanced', label: 'Balanced', hint: 'Required and preferred skills that are verified.' },
  { value: 'strong', label: 'Strong', hint: 'Also strengthens the summary using verified specialties.' },
]

export function TailorPanel({
  job,
  onClose,
}: {
  job: { id: string; job_title: string; company: string; hasDescription: boolean }
  onClose: () => void
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [mode, setMode] = useState<TailorMode>('balanced')
  const [jd, setJd] = useState('')
  const [needsJd, setNeedsJd] = useState(!job.hasDescription)
  const [busy, setBusy] = useState<null | 'loading' | 'tailoring' | 'exporting'>('loading')
  const [error, setError] = useState<string | null>(null)

  // Resume a previous review for this job if one exists.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/resume/tailor?job_id=${encodeURIComponent(job.id)}`)
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data.session) {
          setSession(data.session)
          setMode((data.session.mode as TailorMode) || 'balanced')
          setNeedsJd(false)
        }
      } catch {
        /* first run, nothing stored */
      } finally {
        if (!cancelled) setBusy(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [job.id])

  const runTailor = useCallback(async () => {
    setBusy('tailoring')
    setError(null)
    try {
      const res = await fetch('/api/resume/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id, mode, ...(jd.trim() ? { job_description: jd.trim() } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.needsDescription) setNeedsJd(true)
        throw new Error(data.error || 'Tailoring failed.')
      }
      setSession(data.session)
      setNeedsJd(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }, [job.id, mode, jd])

  const persist = useCallback(
    async (changes: TailorChange[]) => {
      if (!session) return
      setSession({ ...session, changes })
      try {
        await fetch('/api/resume/tailor', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: session.id, changes }),
        })
      } catch {
        /* local state is already updated; a failed persist just means the
           decision is not resumable after a reload */
      }
    },
    [session]
  )

  const setStatus = (id: string, status: TailorChange['status']) => {
    if (!session) return
    persist(session.changes.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  const editUpdated = (id: string, updated: string) => {
    if (!session) return
    setSession({ ...session, changes: session.changes.map((c) => (c.id === id ? { ...c, updated } : c)) })
  }

  const acceptAll = () => {
    if (!session) return
    persist(session.changes.map((c) => (c.status === 'pending' ? { ...c, status: 'accepted' } : c)))
  }

  async function exportResume(format: 'pdf' | 'docx') {
    if (!session) return
    setBusy('exporting')
    setError(null)
    try {
      // Persist any inline edits first — the server re-applies changes from the
      // stored session, so unsaved edits would silently not make it into the file.
      await fetch('/api/resume/tailor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, changes: session.changes }),
      })

      const res = await fetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, format }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Export failed.')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="(.+?)"/)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = match?.[1] || `resume.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const pending = session?.changes.filter((c) => c.status === 'pending').length ?? 0
  const accepted = session?.changes.filter((c) => c.status === 'accepted').length ?? 0

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl gap-0 p-0">
        <SheetHeader className="border-b border-border shrink-0">
          <SheetTitle>{job.job_title}</SheetTitle>
          <SheetDescription className="font-mono">{job.company}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">
          {/* Mode + run */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <Button
                  key={m.value}
                  variant={mode === m.value ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setMode(m.value)}
                  title={m.hint}
                  className="font-mono uppercase tracking-wide"
                >
                  {m.label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>

            {needsJd && (
              <Textarea
                aria-label="Job description"
                className="min-h-32 text-xs"
                placeholder="No description stored for this job. Paste the job description here — it gets saved to the job for next time."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            )}

            <Button onClick={runTailor} disabled={busy !== null} aria-busy={busy === 'tailoring'} className="self-start font-mono uppercase tracking-wide">
              {busy === 'tailoring' ? 'Tailoring…' : session ? 'Re-run tailoring' : 'Tailor resume'}
            </Button>
          </section>

          {error && (
            <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {session && (
            <>
              {session.engine === 'local' && (
                <div className="bg-secondary/10 border border-secondary/25 text-secondary-foreground text-[11px] font-mono rounded-xl px-4 py-2.5">
                  Local engine — no OPENROUTER_API_KEY set. Gap analysis only, no rewrites proposed.
                </div>
              )}

              {/* Relevance */}
              <section className="grid grid-cols-2 gap-3">
                <Stat label="Relevance before" value={session.matchBefore} />
                <Stat label="Estimated after" value={session.matchAfter} accent />
              </section>
              <p className="text-[10px] font-mono text-muted-foreground/70 -mt-3">
                Estimated relevance, not a real ATS score.
              </p>

              {/* Gaps */}
              {session.stillMissing.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
                    Still missing
                  </h3>
                  {session.stillMissing.map((g) => (
                    <div key={g.skill} className="text-xs border border-border rounded-lg px-3 py-2 bg-muted/30">
                      <span className="font-mono text-secondary-foreground">{g.skill}</span>
                      {g.note && <span className="text-muted-foreground"> - {g.note}</span>}
                    </div>
                  ))}
                </section>
              )}

              {/* Changes */}
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
                    Proposed changes{' '}
                    <span className="text-muted-foreground/60">
                      ({accepted} accepted / {session.changes.length})
                    </span>
                  </h3>
                  {pending > 0 && (
                    <Button variant="link" size="sm" onClick={acceptAll} className="h-auto p-0 font-mono text-primary">
                      accept all {pending} pending
                    </Button>
                  )}
                </div>

                {session.changes.length === 0 && (
                  <p className="text-xs text-muted-foreground border border-dashed border-border rounded-xl px-4 py-6 text-center">
                    No truthful rewrite was available for this posting. Nothing was invented to fill the gap.
                  </p>
                )}

                {session.changes.map((c) => (
                  <ChangeCard
                    key={c.id}
                    change={c}
                    onAccept={() => setStatus(c.id, 'accepted')}
                    onReject={() => setStatus(c.id, 'rejected')}
                    onEdit={(v) => editUpdated(c.id, v)}
                    onCommitEdit={() => persist(session.changes)}
                  />
                ))}
              </section>

              {/* Keywords */}
              {session.keywords.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
                    Keywords
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {session.keywords.map((k) => (
                      <Badge
                        key={k.keyword}
                        variant={k.status === 'Verified' ? 'default' : k.status === 'Unverified' ? 'secondary' : 'outline'}
                        title={`${k.importance} · ${k.status} · ${k.location}`}
                        className="font-mono"
                      >
                        {k.keyword}
                        {k.importance === 'Required' && '*'}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Export */}
        {session && (
          <SheetFooter className="border-t border-border flex-row items-center justify-between gap-4 shrink-0">
            <span className="text-[11px] font-mono text-muted-foreground">
              {accepted > 0 ? `${accepted} change(s) will be applied.` : 'Exporting your profile unchanged.'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportResume('docx')}
                disabled={busy !== null}
                aria-label="Export as .docx"
                className="font-mono uppercase tracking-wide"
              >
                {busy === 'exporting' ? '…' : '.docx'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportResume('pdf')}
                disabled={busy !== null}
                aria-label="Export as .pdf"
                className="font-mono uppercase tracking-wide"
              >
                {busy === 'exporting' ? '…' : '.pdf'}
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="border border-border rounded-xl px-4 py-3 bg-muted/30">
      <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  )
}

function ChangeCard({
  change,
  onAccept,
  onReject,
  onEdit,
  onCommitEdit,
}: {
  change: TailorChange
  onAccept: () => void
  onReject: () => void
  onEdit: (v: string) => void
  onCommitEdit: () => void
}) {
  const [open, setOpen] = useState(false)

  const ring =
    change.status === 'accepted' ? 'ring-primary/40' : change.status === 'rejected' ? 'ring-border opacity-50' : 'ring-border'

  return (
    <div className={`border rounded-xl bg-muted/20 p-4 flex flex-col gap-3 transition-colors ring-1 ${ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
          {[change.section, change.company, change.bulletLabel].filter(Boolean).join(' · ')}
        </div>
        <Badge
          variant={change.status === 'accepted' ? 'default' : change.status === 'rejected' ? 'outline' : 'secondary'}
          className="font-mono uppercase"
        >
          {change.status}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground line-through decoration-destructive/40">{change.original}</div>

      <Textarea
        aria-label="Proposed rewrite"
        className="min-h-16 text-xs"
        value={change.updated}
        onChange={(e) => onEdit(e.target.value)}
        onBlur={onCommitEdit}
      />

      {change.keywordsAdded.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {change.keywordsAdded.map((k) => (
            <Badge key={k} variant="outline" className="font-mono border-primary/25 bg-primary/8 text-primary">
              +{k}
            </Badge>
          ))}
        </div>
      )}

      <Button variant="link" size="sm" onClick={() => setOpen((o) => !o)} className="h-auto p-0 self-start font-mono text-muted-foreground">
        {open ? '- hide evidence' : '+ why this change'}
      </Button>

      {open && (
        <div className="text-[11px] text-muted-foreground border-l-2 border-primary/30 pl-3 flex flex-col gap-1.5">
          {change.reason && <p>{change.reason}</p>}
          {change.evidence && (
            <p>
              <span className="font-mono uppercase text-[10px] text-primary/80">Evidence: </span>
              {change.evidence}
            </p>
          )}
        </div>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onAccept} className="font-mono uppercase tracking-wide">
          Accept
        </Button>
        <Button variant="outline" size="sm" onClick={onReject} className="font-mono uppercase tracking-wide">
          Reject
        </Button>
      </div>
    </div>
  )
}
