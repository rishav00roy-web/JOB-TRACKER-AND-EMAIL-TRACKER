'use client'

import { useRef, useState } from 'react'
import type { CareerProfile } from '@/lib/resume/types'

const EMPTY: CareerProfile = {
  personal: { name: '', email: '', phone: '', location: '', links: [] },
  summary: { id: 'summary', text: '' },
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  verification: 'extracted',
}

const inputClass =
  'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors'

export function ProfileEditor({
  initialProfile,
  initialFilename,
}: {
  initialProfile: CareerProfile | null
  initialFilename: string | null
}) {
  const [profile, setProfile] = useState<CareerProfile>(initialProfile ?? EMPTY)
  const [filename, setFilename] = useState<string | null>(initialFilename)
  const [busy, setBusy] = useState<null | 'parsing' | 'saving'>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isVerified = profile.verification === 'verified'

  async function handleUpload(file: File) {
    setBusy('parsing')
    setError(null)
    setSaved(false)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/resume/parse', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed.')
      setProfile(data.profile)
      setFilename(data.filename)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleSave() {
    setBusy('saving')
    setError(null)
    try {
      const res = await fetch('/api/resume/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, filename, verified: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed.')
      setProfile({ ...profile, verification: 'verified' })
      setSaved(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const patch = (fn: (draft: CareerProfile) => void) => {
    const next = structuredClone(profile)
    fn(next)
    // Any hand edit un-verifies the profile until it is saved again.
    next.verification = 'extracted'
    setProfile(next)
    setSaved(false)
  }

  // Index-scoped helpers. tsconfig has noUncheckedIndexedAccess on, and a
  // no-op when the row vanished is the right behaviour anyway.
  const patchExp = (ei: number, fn: (exp: CareerProfile['experience'][number]) => void) =>
    patch((d) => {
      const exp = d.experience[ei]
      if (exp) fn(exp)
    })

  const patchBullet = (ei: number, bi: number, text: string) =>
    patch((d) => {
      const bullet = d.experience[ei]?.bullets[bi]
      if (bullet) bullet.text = text
    })

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6">
      {/* Upload */}
      <section className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground font-mono">Source resume</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {filename ? (
                <>
                  Parsed from <span className="text-foreground font-mono">{filename}</span>
                </>
              ) : (
                'Upload a PDF or DOCX. Nothing is invented — every field comes from the file.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              aria-busy={busy === 'parsing'}
              className="text-xs font-mono uppercase tracking-wider bg-primary/10 border border-primary/30 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-colors active:scale-[0.96] disabled:active:scale-100"
            >
              {busy === 'parsing' ? 'Parsing…' : filename ? 'Replace' : 'Upload resume'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Verification banner */}
      <div
        className={`flex items-center gap-2 text-xs font-mono px-4 py-2.5 rounded-xl border ${
          isVerified
            ? 'bg-primary/5 border-primary/20 text-primary'
            : 'bg-secondary/5 border-secondary/20 text-secondary'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-primary' : 'bg-secondary animate-pulse'}`} />
        {isVerified
          ? 'VERIFIED — tailoring will treat these as facts.'
          : 'EXTRACTED — review every field, then confirm. Tailoring only reuses what is here.'}
      </div>

      {/* Personal */}
      <section className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">Personal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['name', 'email', 'phone', 'location'] as const).map((field) => (
            <input
              key={field}
              aria-label={field.charAt(0).toUpperCase() + field.slice(1)}
              className={inputClass}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              value={profile.personal[field]}
              onChange={(e) => patch((d) => void (d.personal[field] = e.target.value))}
            />
          ))}
        </div>
        <input
          aria-label="Links, comma separated"
          className={inputClass}
          placeholder="Links (comma separated)"
          value={profile.personal.links.join(', ')}
          onChange={(e) =>
            patch((d) => void (d.personal.links = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))
          }
        />
      </section>

      {/* Summary */}
      <section className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">Summary</h2>
        <textarea
          aria-label="Professional summary"
          className={`${inputClass} min-h-24 resize-y`}
          placeholder="Professional summary"
          value={profile.summary.text}
          onChange={(e) => patch((d) => void (d.summary.text = e.target.value))}
        />
      </section>

      {/* Skills */}
      <section className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
          Skills <span className="text-muted-foreground/50">({profile.skills.length})</span>
        </h2>
        <textarea
          aria-label="Skills, comma separated"
          className={`${inputClass} min-h-20 resize-y font-mono text-xs`}
          placeholder="Comma separated"
          value={profile.skills.join(', ')}
          onChange={(e) => patch((d) => void (d.skills = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))}
        />
      </section>

      {/* Experience */}
      <section className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
          Experience <span className="text-muted-foreground/50">({profile.experience.length})</span>
        </h2>

        {profile.experience.length === 0 && (
          <p className="text-xs font-mono text-muted-foreground/50">No experience extracted yet.</p>
        )}

        {profile.experience.map((exp, ei) => (
          <div key={exp.id} className="border border-white/5 rounded-xl p-4 flex flex-col gap-3 bg-black/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                aria-label={`Title, experience ${ei + 1}`}
                className={inputClass}
                placeholder="Title"
                value={exp.title}
                onChange={(e) => patchExp(ei, (x) => void (x.title = e.target.value))}
              />
              <input
                aria-label={`Company, experience ${ei + 1}`}
                className={inputClass}
                placeholder="Company"
                value={exp.company}
                onChange={(e) => patchExp(ei, (x) => void (x.company = e.target.value))}
              />
              <input
                aria-label={`Start date, experience ${ei + 1}`}
                className={inputClass}
                placeholder="Start"
                value={exp.startDate}
                onChange={(e) => patchExp(ei, (x) => void (x.startDate = e.target.value))}
              />
              <input
                aria-label={`End date, experience ${ei + 1}`}
                className={inputClass}
                placeholder="End"
                value={exp.endDate}
                onChange={(e) => patchExp(ei, (x) => void (x.endDate = e.target.value))}
              />
            </div>
            <input
              aria-label={`Technologies, experience ${ei + 1}, comma separated`}
              className={`${inputClass} font-mono text-xs`}
              placeholder="Technologies (comma separated)"
              value={exp.technologies.join(', ')}
              onChange={(e) =>
                patchExp(
                  ei,
                  (x) =>
                    void (x.technologies = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean))
                )
              }
            />

            <div className="flex flex-col gap-2">
              {exp.bullets.map((b, bi) => (
                <div key={b.id} className="flex gap-2 items-start">
                  <span className="text-primary/60 text-xs mt-2.5" aria-hidden="true">▸</span>
                  <textarea
                    aria-label={`Bullet point ${bi + 1}, experience ${ei + 1}`}
                    className={`${inputClass} min-h-16 resize-y text-xs`}
                    value={b.text}
                    onChange={(e) => patchBullet(ei, bi, e.target.value)}
                  />
                  <button
                    onClick={() => patchExp(ei, (x) => void x.bullets.splice(bi, 1))}
                    aria-label={`Remove bullet point ${bi + 1}`}
                    className="text-muted-foreground hover:text-destructive text-xs mt-2 px-1 rounded-sm transition-colors active:scale-[0.96]"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
              ))}
              <button
                onClick={() => patchExp(ei, (x) => void x.bullets.push({ id: `${exp.id}-b${Date.now()}`, text: '' }))}
                className="text-[11px] font-mono text-muted-foreground hover:text-primary self-start transition-colors active:scale-[0.96]"
              >
                + add bullet
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Save */}
      <div className="sticky bottom-4 flex items-center justify-between gap-4 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-4">
        <span className="text-xs font-mono text-muted-foreground">
          {saved ? 'Saved. Profile is verified.' : 'Confirm these facts before tailoring against them.'}
        </span>
        <button
          onClick={handleSave}
          disabled={busy !== null}
          aria-busy={busy === 'saving'}
          className="text-xs font-mono uppercase tracking-wider bg-primary text-primary-foreground px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity font-bold active:scale-[0.96] disabled:active:scale-100"
        >
          {busy === 'saving' ? 'Saving…' : 'Confirm & save profile'}
        </button>
      </div>
    </div>
  )
}
