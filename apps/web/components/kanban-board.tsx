'use client'

import { useState } from 'react'

type Job = {
  id: string
  job_title: string
  company: string
  stage: 'wishlist' | 'applied' | 'interview' | 'offer' | 'rejected'
  match_score: number
  key_skills_match: string[]
  application_link: string
  niche_flag?: boolean
}

const STAGES = ['wishlist', 'applied', 'interview', 'offer', 'rejected'] as const

function ScoreRing({ score }: { score: number }) {
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  // Use primary (cyan) for high scores, secondary (violet) for medium, and muted for low
  const strokeColor = score >= 80 ? 'var(--color-primary)' : score >= 50 ? 'var(--color-secondary)' : 'var(--color-muted-foreground)'
  const glowClass = score >= 80 ? 'drop-shadow-[0_0_4px_rgba(0,240,255,0.8)]' : score >= 50 ? 'drop-shadow-[0_0_4px_rgba(139,92,246,0.6)]' : ''

  return (
    <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
      <svg className="w-10 h-10 transform -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="stroke-white/10"
          strokeWidth="3"
          fill="transparent"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className={`transition-all duration-1000 ease-out ${glowClass}`}
          stroke={strokeColor}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono text-foreground">{score}</span>
    </div>
  )
}

export function KanbanBoard({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs] = useState<Job[]>(initialJobs)

  return (
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
                <div 
                  key={job.id} 
                  className="group relative bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-xl flex flex-col gap-3 hover:border-primary/50 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)] transition-all duration-300"
                >
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
                  
                  {job.niche_flag && (
                    <div className="flex items-center gap-1 mt-1 w-fit">
                      <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                      <span className="text-[10px] font-mono text-secondary">Niche Opportunity</span>
                    </div>
                  )}

                  <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between">
                    <a 
                      href={job.application_link} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                    >
                      VIEW POSTING <span className="text-xs">↗</span>
                    </a>
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
  )
}
