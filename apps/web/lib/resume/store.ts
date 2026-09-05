// Supabase access for the resume-tailor tables. Both tables have RLS on with
// no public policy, so everything here goes through the service-role client
// and must stay server-side.

import { supabaseAdmin } from '@/lib/supabase'
import type { CareerProfile, TailorResult } from './types'

export type StoredProfile = {
  id: string
  data: CareerProfile
  source_filename: string | null
  updated_at: string
}

export async function loadProfile(): Promise<StoredProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('career_profile')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  return (data as StoredProfile) ?? null
}

// Single-row table: overwrite the existing profile rather than accumulating
// versions, so "the profile" is never ambiguous.
export async function saveProfile(profile: CareerProfile, sourceFilename?: string): Promise<StoredProfile> {
  const existing = await loadProfile()

  const row = {
    data: profile,
    source_filename: sourceFilename ?? existing?.source_filename ?? null,
  }

  const query = existing
    ? supabaseAdmin.from('career_profile').update(row).eq('id', existing.id)
    : supabaseAdmin.from('career_profile').insert(row)

  const { data, error } = await query.select().single()
  if (error) throw new Error(`Failed to save profile: ${error.message}`)
  return data as StoredProfile
}

export type StoredSession = TailorResult & {
  id: string
  job_id: string | null
  job_description: string
  mode: string
  created_at: string
}

export async function saveSession(params: {
  jobId: string | null
  jobDescription: string
  mode: string
  result: TailorResult
}): Promise<StoredSession> {
  const { data, error } = await supabaseAdmin
    .from('tailor_sessions')
    .insert({
      job_id: params.jobId,
      job_title: params.result.jobTitle,
      mode: params.mode,
      job_description: params.jobDescription,
      match_before: params.result.matchBefore,
      match_after: params.result.matchAfter,
      strong_matches: params.result.strongMatches,
      still_missing: params.result.stillMissing,
      changes: params.result.changes,
      keywords: params.result.keywords,
      engine: params.result.engine,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save tailoring session: ${error.message}`)
  return rowToSession(data)
}

export async function loadSession(id: string): Promise<StoredSession | null> {
  const { data, error } = await supabaseAdmin.from('tailor_sessions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load session: ${error.message}`)
  return data ? rowToSession(data) : null
}

export async function loadLatestSessionForJob(jobId: string): Promise<StoredSession | null> {
  const { data, error } = await supabaseAdmin
    .from('tailor_sessions')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load session: ${error.message}`)
  return data ? rowToSession(data) : null
}

export async function updateSessionChanges(id: string, changes: TailorResult['changes']) {
  const { error } = await supabaseAdmin.from('tailor_sessions').update({ changes }).eq('id', id)
  if (error) throw new Error(`Failed to update session: ${error.message}`)
}

function rowToSession(row: any): StoredSession {
  return {
    id: row.id,
    job_id: row.job_id,
    job_description: row.job_description ?? '',
    mode: row.mode,
    created_at: row.created_at,
    jobTitle: row.job_title ?? 'Untitled Role',
    matchBefore: row.match_before ?? 0,
    matchAfter: row.match_after ?? 0,
    strongMatches: row.strong_matches ?? [],
    stillMissing: row.still_missing ?? [],
    changes: row.changes ?? [],
    keywords: row.keywords ?? [],
    engine: row.engine ?? 'ai',
  }
}
