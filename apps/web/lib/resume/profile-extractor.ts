// Raw resume text -> structured CareerProfile, via the model.
//
// There is no prior source of truth to check the model against here (unlike
// tailoring, where the profile itself is the authority), so truthfulness rests
// on the source text. The prompt forbids invention and the sanitizer drops
// anything malformed; blank beats guessed.

import { callChatCompletionWithRetry } from './ai'
import { extractJsonObject } from './extract-json'
import type { CareerProfile, ProfileBullet } from './types'

const SYSTEM_PROMPT = `You convert resume text into a structured JSON career profile.

STRICT RULES (never violate):
- Never invent employers, job titles, dates, degrees, certifications, skills, or accomplishments that are not explicitly stated in the resume text.
- Copy achievement bullets close to verbatim. You may fix obvious OCR/line-break damage and drop leading bullet glyphs, nothing more.
- If a field is not present in the text, return an empty string or an empty array. Never guess.
- Keep every distinct bullet as its own entry. Do not merge or summarize bullets.

Respond with ONLY a single JSON object, no markdown fences and no prose, matching exactly this shape:
{
  "personal": {"name": string, "email": string, "phone": string, "location": string, "links": string[]},
  "summary": {"text": string},
  "skills": string[],
  "experience": [{"company": string, "title": string, "startDate": string, "endDate": string, "location": string, "technologies": string[], "bullets": [{"text": string}]}],
  "education": [{"institution": string, "degree": string, "field": string, "startDate": string, "endDate": string}],
  "certifications": [{"name": string, "issuer": string, "date": string}]
}`

export async function extractProfileFromResumeText(resumeText: string): Promise<CareerProfile> {
  const content = await callChatCompletionWithRetry(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `RESUME TEXT:\n${resumeText}\n\nRespond with only the JSON object described above.` },
    ],
    { json: true }
  )
  return sanitizeProfile(content)
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : []

export function sanitizeProfile(raw: string | unknown): CareerProfile {
  const parsed = (typeof raw === 'string' ? extractJsonObject(raw) : raw) as Record<string, any>

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The AI response was not a JSON object.')
  }

  const personal = (parsed.personal ?? {}) as Record<string, unknown>

  const experience = (Array.isArray(parsed.experience) ? parsed.experience : [])
    .filter((e: unknown) => e && typeof e === 'object')
    .map((e: Record<string, unknown>, i: number) => {
      const expId = `exp-${i}`
      const bullets: ProfileBullet[] = (Array.isArray(e.bullets) ? e.bullets : [])
        .map((b: unknown) => (typeof b === 'string' ? b : str((b as Record<string, unknown>)?.text)))
        .filter((t): t is string => Boolean(t))
        .map((text, bi) => ({ id: `${expId}-b${bi}`, text }))

      return {
        id: expId,
        company: str(e.company),
        title: str(e.title),
        startDate: str(e.startDate),
        endDate: str(e.endDate),
        location: str(e.location),
        technologies: strArray(e.technologies),
        bullets,
      }
    })

  const education = (Array.isArray(parsed.education) ? parsed.education : [])
    .filter((e: unknown) => e && typeof e === 'object')
    .map((e: Record<string, unknown>, i: number) => ({
      id: `edu-${i}`,
      institution: str(e.institution),
      degree: str(e.degree),
      field: str(e.field),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
    }))
    .filter((e) => e.institution || e.degree)

  const certifications = (Array.isArray(parsed.certifications) ? parsed.certifications : [])
    .filter((c: unknown) => c && typeof c === 'object')
    .map((c: Record<string, unknown>, i: number) => ({
      id: `cert-${i}`,
      name: str(c.name),
      issuer: str(c.issuer),
      date: str(c.date),
    }))
    .filter((c) => c.name)

  return {
    personal: {
      name: str(personal.name),
      email: str(personal.email),
      phone: str(personal.phone),
      location: str(personal.location),
      links: strArray(personal.links),
    },
    summary: { id: 'summary', text: str((parsed.summary as Record<string, unknown>)?.text ?? parsed.summary) },
    skills: strArray(parsed.skills),
    experience,
    education,
    certifications,
    verification: 'extracted',
  }
}
