'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TailorChange, TailorMode, TailorResult } from '@/lib/resume/types'

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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // Focus management: move focus into the panel on open, restore it to
  // whatever triggered the panel on close, and let Escape close it — this
  // is a full-screen overlay acting as a modal, so it needs the same
  // keyboard contract a native <dialog> gets for free.
  useEffect(() => {
    triggerRef.current = document.activeElement
    closeButtonRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl bg-[#080808] border-l border-white/10 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tailor-panel-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 id="tailor-panel-title" className="font-semibold text-foreground">
              {job.job_title}
            </h2>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{job.company}</p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close tailor panel"
            className="text-muted-foreground hover:text-foreground text-lg leading-none px-2 py-1 rounded-md transition-colors active:scale-[0.96]"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 flex flex-col gap-5">
          {/* Mode + run */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  title={m.hint}
                  aria-pressed={mode === m.value}
                  className={`text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-colors active:scale-[0.96] ${
                    mode === m.value
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-white/5 border-white/10 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>

            {needsJd && (
              <textarea
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 min-h-32 resize-y focus:outline-none focus:border-primary/50"
                placeholder="No description stored for this job. Paste the job description here — it gets saved to the job for next time."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            )}

            <button
              onClick={runTailor}
              disabled={busy !== null}
              aria-busy={busy === 'tailoring'}
              className="self-start text-xs font-mono uppercase tracking-wider bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.96] disabled:active:scale-100"
            >
              {busy === 'tailoring' ? 'Tailoring…' : session ? 'Re-run tailoring' : 'Tailor resume'}
            </button>
          </section>

          {error && (
            <div
              role="alert"
              className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-xl px-4 py-3"
            >
              {error}
            </div>
          )}

          {session && (
            <>
              {session.engine === 'local' && (
                <div className="bg-secondary/5 border border-secondary/20 text-secondary text-[11px] font-mono rounded-xl px-4 py-2.5">
                  LOCAL ENGINE — no OPENROUTER_API_KEY set. Gap analysis only, no rewrites proposed.
                </div>
              )}

              {/* Relevance */}
              <section className="grid grid-cols-2 gap-3">
                <Stat label="Relevance before" value={session.matchBefore} />
                <Stat label="Estimated after" value={session.matchAfter} accent />
              </section>
              <p className="text-[10px] font-mono text-muted-foreground/60 -mt-3">
                Estimated relevance, not a real ATS score.
              </p>

              {/* Gaps */}
              {session.stillMissing.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
                    Still missing
                  </h3>
                  {session.stillMissing.map((g) => (
                    <div key={g.skill} className="text-xs border border-white/5 rounded-lg px-3 py-2 bg-black/30">
                      <span className="font-mono text-secondary">{g.skill}</span>
                      {g.note && <span className="text-muted-foreground"> — {g.note}</span>}
                    </div>
                  ))}
                </section>
              )}

              {/* Changes */}
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
                    Proposed changes{' '}
                    <span className="text-muted-foreground/50">
                      ({accepted} accepted / {session.changes.length})
                    </span>
                  </h3>
                  {pending > 0 && (
                    <button
                      onClick={acceptAll}
                      className="text-[11px] font-mono text-primary hover:underline"
                    >
                      accept all {pending} pending
                    </button>
                  )}
                </div>

                {session.changes.length === 0 && (
                  <p className="text-xs text-muted-foreground border border-dashed border-white/10 rounded-xl px-4 py-6 text-center">
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
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
                    Keywords
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {session.keywords.map((k) => (
                      <span
                        key={k.keyword}
                        title={`${k.importance} · ${k.status} · ${k.location}`}
                        className={`text-[10px] font-mono px-2 py-1 rounded-md border ${
                          k.status === 'Verified'
                            ? 'bg-primary/10 border-primary/20 text-primary'
                            : k.status === 'Unverified'
                              ? 'bg-secondary/10 border-secondary/20 text-secondary'
                              : 'bg-white/5 border-white/10 text-muted-foreground'
                        }`}
                      >
                        {k.keyword}
                        {k.importance === 'Required' && '*'}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Export */}
        {session && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-white/10 shrink-0 bg-black/60">
            <span className="text-[11px] font-mono text-muted-foreground">
              {accepted > 0 ? `${accepted} change(s) will be applied.` : 'Exporting your profile unchanged.'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => exportResume('docx')}
                disabled={busy !== null}
                aria-label="Export as .docx"
                className="text-xs font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-foreground px-4 py-2 rounded-lg hover:border-primary/40 disabled:opacity-40 transition-colors active:scale-[0.96] disabled:active:scale-100"
              >
                {busy === 'exporting' ? '…' : '.docx'}
              </button>
              <button
                onClick={() => exportResume('pdf')}
                disabled={busy !== null}
                aria-label="Export as .pdf"
                className="text-xs font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-foreground px-4 py-2 rounded-lg hover:border-primary/40 disabled:opacity-40 transition-colors active:scale-[0.96] disabled:active:scale-100"
              >
                {busy === 'exporting' ? '…' : '.pdf'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="border border-white/5 rounded-xl px-4 py-3 bg-black/30">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
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

  const border =
    change.status === 'accepted'
      ? 'border-primary/40'
      : change.status === 'rejected'
        ? 'border-white/5 opacity-50'
        : 'border-white/10'

  return (
    <div className={`border ${border} rounded-xl bg-black/40 p-4 flex flex-col gap-3 transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {[change.section, change.company, change.bulletLabel].filter(Boolean).join(' · ')}
        </div>
        <span
          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
            change.status === 'accepted'
              ? 'border-primary/30 text-primary bg-primary/10'
              : change.status === 'rejected'
                ? 'border-white/10 text-muted-foreground'
                : 'border-secondary/30 text-secondary bg-secondary/10'
          }`}
        >
          {change.status}
        </span>
      </div>

      <div className="text-xs text-muted-foreground line-through decoration-destructive/40">{change.original}</div>

      <textarea
        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground min-h-16 resize-y focus:outline-none focus:border-primary/50"
        value={change.updated}
        onChange={(e) => onEdit(e.target.value)}
        onBlur={onCommitEdit}
      />

      {change.keywordsAdded.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {change.keywordsAdded.map((k) => (
            <span key={k} className="text-[10px] font-mono bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded">
              +{k}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] font-mono text-muted-foreground hover:text-primary self-start transition-colors"
      >
        {open ? '− hide evidence' : '+ why this change'}
      </button>

      {open && (
        <div className="text-[11px] text-muted-foreground border-l-2 border-primary/30 pl-3 flex flex-col gap-1.5">
          {change.reason && <p>{change.reason}</p>}
          {change.evidence && (
            <p>
              <span className="font-mono uppercase text-[10px] text-primary/70">Evidence: </span>
              {change.evidence}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onAccept}
          className="text-[11px] font-mono uppercase tracking-wider bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors active:scale-[0.96]"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="text-[11px] font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-muted-foreground px-3 py-1.5 rounded-lg hover:text-foreground transition-colors active:scale-[0.96]"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
