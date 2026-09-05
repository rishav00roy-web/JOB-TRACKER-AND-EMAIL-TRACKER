'use client'

import { useState } from 'react'
import { TailorPanel } from '@/components/tailor-panel'

type Job = {
  id: string
  job_title: string
  company: string
  stage: 'wishlist' | 'applied' | 'interview' | 'offer' | 'rejected'
  match_score: number
  key_skills_match: string[]
  application_link: string
  niche_flag?: boolean
  clearance_required?: boolean
  description?: string | null
}

const STAGES = ['wishlist', 'applied', 'interview', 'offer', 'rejected'] as const

function ScoreRing({ score }: { score: number }) {
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference

  // Thresholds match how scoring.ts actually distributes: headline score is
  // the best single category's coverage, so a genuinely strong non-technical
  // AI-role match often lands ~35-60%, not 80+. One accent (cyan) throughout —
  // tiers are expressed as glow intensity, not a second hue.
  const tier = score >= 60 ? 'strong' : score >= 35 ? 'good' : 'weak'
  const glowClass =
    tier === 'strong'
      ? 'drop-shadow-[0_0_5px_rgba(56,214,214,0.85)]'
      : tier === 'good'
        ? 'drop-shadow-[0_0_3px_rgba(56,214,214,0.45)]'
        : ''
  const strokeOpacity = tier === 'weak' ? '0.35' : '1'

  return (
    <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
      <svg className="w-10 h-10 transform -rotate-90">
        <circle cx="20" cy="20" r={radius} className="stroke-white/10" strokeWidth="3" fill="transparent" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${glowClass}`}
          stroke="var(--color-primary)"
          strokeOpacity={strokeOpacity}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-[11px] font-bold font-mono tabular-nums text-foreground">{score}</span>
    </div>
  )
}

export function KanbanBoard({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs] = useState<Job[]>(initialJobs)
  const [tailoring, setTailoring] = useState<Job | null>(null)

  return (
    <>
    {tailoring && (
      <TailorPanel
        job={{
          id: tailoring.id,
          job_title: tailoring.job_title,
          company: tailoring.company,
          hasDescription: Boolean(tailoring.description),
        }}
        onClose={() => setTailoring(null)}
      />
    )}
    {/* Mobile-only hint that more stage columns exist off-screen — the board
        is a horizontal-scroll row with no visible scrollbar on touch
        devices, so without this the other columns are undiscoverable. A
        gradient fade doesn't work here (nothing behind it to fade against
        at rest, since a column often ends before the viewport edge) — a
        plain visible indicator does. */}
    <div
      className="sm:hidden fixed z-10 flex items-center gap-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-full px-2 py-1.5 pointer-events-none animate-pulse"
      style={{ top: '50%', right: '12px', transform: 'translateY(-50%)' }}
      aria-hidden="true"
    >
      <span className="text-[10px] font-mono text-muted-foreground">SWIPE</span>
      <span className="text-primary text-xs">→</span>
    </div>
    <div className="flex h-screen w-full overflow-x-auto overflow-y-hidden bg-background p-6 gap-6 custom-scrollbar">
      {STAGES.map(stage => {
        const stageJobs = jobs.filter(j => j.stage === stage)
        return (
          <div key={stage} className="flex flex-col flex-shrink-0 w-[340px] bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
                {stage}
              </h2>
              <span className="text-[10px] font-mono bg-white/5 border border-white/10 text-muted-foreground px-2 py-0.5 rounded-full">
                {stageJobs.length}
              </span>
            </div>
            
            <div className="flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar pb-10">
              {stageJobs.map(job => (
                // Double-bezel: a thin outer shell (like a glass plate in a
                // machined tray) around the actual card, radii concentric
                // (outer 16px - 4px shell padding = inner 12px) so the curve
                // reads as one continuous surface, not two coincidentally
                // similar rounded rects.
                <div
                  key={job.id}
                  className="group relative rounded-2xl p-1 bg-white/[0.02] ring-1 ring-white/5 hover:ring-primary/25 hover:-translate-y-0.5 transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]"
                >
                  <div className="relative bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-xl flex flex-col gap-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] group-hover:border-primary/50 group-hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_20px_rgba(56,214,214,0.12)] transition-[border-color,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  {/* Subtle top inner glow on hover */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col">
                      <h3 className="font-semibold text-foreground text-sm leading-snug">{job.job_title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">{job.company}</p>
                    </div>
                    {job.match_score > 0 && <ScoreRing score={job.match_score} />}
                  </div>
                  
                  {job.key_skills_match && job.key_skills_match.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {job.key_skills_match.slice(0, 4).map(skill => (
                        <span key={skill} className="text-[10px] font-mono font-medium bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded-md">
                          {skill}
                        </span>
                      ))}
                      {job.key_skills_match.length > 4 && (
                        <span className="text-[10px] font-mono text-muted-foreground px-1 py-0.5">
                          +{job.key_skills_match.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {job.clearance_required && (
                    <div className="flex items-center gap-1 mt-1 w-fit" title="Requires U.S. government clearance or citizenship verification">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive" aria-hidden="true" />
                      <span className="text-[10px] font-mono text-destructive">Clearance Required</span>
                    </div>
                  )}

                  {job.niche_flag && !job.clearance_required && (
                    <div className="flex items-center gap-1 mt-1 w-fit">
                      <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" aria-hidden="true" />
                      <span className="text-[10px] font-mono text-secondary">Niche Opportunity</span>
                    </div>
                  )}

                  <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <a
                      href={job.application_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors rounded-sm flex items-center gap-1 active:scale-[0.96]"
                    >
                      VIEW POSTING <span className="text-xs" aria-hidden="true">↗</span>
                    </a>
                    <button
                      onClick={() => setTailoring(job)}
                      title={job.description ? 'Tailor your resume to this posting' : 'No description stored — you can paste one'}
                      className="text-[11px] font-mono uppercase tracking-wider text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/50 px-2 py-1 rounded-md transition-colors active:scale-[0.96]"
                    >
                      Tailor
                    </button>
                  </div>
                  </div>
                </div>
              ))}
              {stageJobs.length === 0 && (
                <div className="flex items-center justify-center h-24 border border-dashed border-white/10 rounded-xl bg-white/5">
                  <span className="text-xs font-mono text-muted-foreground/50">NO JOBS YET</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}
