// Fold accepted changes back into the profile to get the document that will
// actually be exported. Rejected and pending changes are ignored.
//
// A change is applied only if its "original" still matches the live bullet
// verbatim, same rule as the tailor engine — the user may have edited the
// profile between tailoring and exporting.

import type { CareerProfile, TailorChange } from './types'

export function applyChanges(profile: CareerProfile, changes: TailorChange[]): CareerProfile {
  const accepted = new Map<string, TailorChange>()
  for (const c of changes) {
    if (c.status === 'accepted') accepted.set(c.targetBulletId, c)
  }
  if (accepted.size === 0) return profile

  const rewrite = (id: string, current: string) => {
    const change = accepted.get(id)
    if (!change) return current
    if (change.original.trim() !== current.trim()) return current
    return change.updated
  }

  return {
    ...profile,
    summary: { ...profile.summary, text: rewrite('summary', profile.summary.text) },
    experience: profile.experience.map((exp) => ({
      ...exp,
      bullets: exp.bullets.map((b) => ({ ...b, text: rewrite(b.id, b.text) })),
    })),
  }
}

// Filename the export lands under: candidate name + job title, both slugged.
export function resumeFilename(profile: CareerProfile, jobTitle: string, ext: 'pdf' | 'docx') {
  const slug = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)

  const name = slug(profile.personal.name || 'Resume') || 'Resume'
  const role = slug(jobTitle || '')
  return role ? `${name}-${role}.${ext}` : `${name}.${ext}`
}
