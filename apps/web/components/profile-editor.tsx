'use client'

import { useRef, useState } from 'react'
import type { CareerProfile } from '@/lib/resume/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const EMPTY: CareerProfile = {
  personal: { name: '', email: '', phone: '', location: '', links: [] },
  summary: { id: 'summary', text: '' },
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  verification: 'extracted',
}

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
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-5">
      {/* Upload */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">Source resume</h2>
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
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              aria-busy={busy === 'parsing'}
              className="font-mono uppercase tracking-wide"
            >
              {busy === 'parsing' ? 'Parsing…' : filename ? 'Replace' : 'Upload resume'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Verification banner */}
      <div
        className={`flex items-center gap-2 text-xs font-mono px-4 py-2.5 rounded-xl border ${
          isVerified ? 'bg-primary/8 border-primary/25 text-primary' : 'bg-secondary/10 border-secondary/25 text-secondary-foreground'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-primary' : 'bg-secondary animate-pulse'}`} />
        {isVerified
          ? 'Verified — tailoring will treat these as facts.'
          : 'Extracted — review every field, then confirm. Tailoring only reuses what is here.'}
      </div>

      {/* Personal */}
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">Personal</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['name', 'email', 'phone', 'location'] as const).map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label htmlFor={`personal-${field}`}>{field.charAt(0).toUpperCase() + field.slice(1)}</Label>
                <Input
                  id={`personal-${field}`}
                  value={profile.personal[field]}
                  onChange={(e) => patch((d) => void (d.personal[field] = e.target.value))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="personal-links">Links, comma separated</Label>
            <Input
              id="personal-links"
              placeholder="linkedin.com/in/you, github.com/you"
              value={profile.personal.links.join(', ')}
              onChange={(e) => patch((d) => void (d.personal.links = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">Summary</h2>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Professional summary"
            className="min-h-24"
            placeholder="Professional summary"
            value={profile.summary.text}
            onChange={(e) => patch((d) => void (d.summary.text = e.target.value))}
          />
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
            Skills <span className="text-muted-foreground/60">({profile.skills.length})</span>
          </h2>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Skills, comma separated"
            className="min-h-20 font-mono text-xs"
            placeholder="Comma separated"
            value={profile.skills.join(', ')}
            onChange={(e) => patch((d) => void (d.skills = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))}
          />
        </CardContent>
      </Card>

      {/* Experience */}
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
            Experience <span className="text-muted-foreground/60">({profile.experience.length})</span>
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profile.experience.length === 0 && (
            <p className="text-xs font-mono text-muted-foreground/60">No experience extracted yet.</p>
          )}

          {profile.experience.map((exp, ei) => (
            <div key={exp.id} className="border border-border rounded-xl p-4 flex flex-col gap-3 bg-muted/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-${ei}-title`}>Title</Label>
                  <Input id={`exp-${ei}-title`} value={exp.title} onChange={(e) => patchExp(ei, (x) => void (x.title = e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-${ei}-company`}>Company</Label>
                  <Input id={`exp-${ei}-company`} value={exp.company} onChange={(e) => patchExp(ei, (x) => void (x.company = e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-${ei}-start`}>Start</Label>
                  <Input id={`exp-${ei}-start`} value={exp.startDate} onChange={(e) => patchExp(ei, (x) => void (x.startDate = e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-${ei}-end`}>End</Label>
                  <Input id={`exp-${ei}-end`} value={exp.endDate} onChange={(e) => patchExp(ei, (x) => void (x.endDate = e.target.value))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`exp-${ei}-tech`}>Technologies, comma separated</Label>
                <Input
                  id={`exp-${ei}-tech`}
                  className="font-mono text-xs"
                  value={exp.technologies.join(', ')}
                  onChange={(e) =>
                    patchExp(ei, (x) => void (x.technologies = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                {exp.bullets.map((b, bi) => (
                  <div key={b.id} className="flex gap-2 items-start">
                    <span className="text-primary/60 text-xs mt-2.5" aria-hidden="true">▸</span>
                    <Textarea
                      aria-label={`Bullet point ${bi + 1}, experience ${ei + 1}`}
                      className="min-h-16 text-xs"
                      value={b.text}
                      onChange={(e) => patchBullet(ei, bi, e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => patchExp(ei, (x) => void x.bullets.splice(bi, 1))}
                      aria-label={`Remove bullet point ${bi + 1}`}
                      className="mt-1 text-muted-foreground hover:text-destructive"
                    >
                      <span aria-hidden="true">✕</span>
                    </Button>
                  </div>
                ))}
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => patchExp(ei, (x) => void x.bullets.push({ id: `${exp.id}-b${Date.now()}`, text: '' }))}
                  className="h-auto p-0 self-start font-mono text-muted-foreground"
                >
                  + add bullet
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="sticky bottom-4 flex items-center justify-between gap-4 bg-popover/90 backdrop-blur-xl border border-border rounded-2xl px-5 py-4 shadow-lg">
        <span className="text-xs font-mono text-muted-foreground">
          {saved ? 'Saved. Profile is verified.' : 'Confirm these facts before tailoring against them.'}
        </span>
        <Button onClick={handleSave} disabled={busy !== null} aria-busy={busy === 'saving'} className="font-mono uppercase tracking-wide">
          {busy === 'saving' ? 'Saving…' : 'Confirm & save profile'}
        </Button>
      </div>
    </div>
  )
}
