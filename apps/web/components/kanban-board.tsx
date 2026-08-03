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

export function KanbanBoard({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs] = useState<Job[]>(initialJobs)

  return (
    <div className="flex h-screen w-full overflow-x-auto overflow-y-hidden bg-background p-6 gap-6">
      {STAGES.map(stage => {
        const stageJobs = jobs.filter(j => j.stage === stage)
        return (
          <div key={stage} className="flex flex-col flex-shrink-0 w-[350px] bg-card/50 border border-white/10 rounded-xl p-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
              {stage} <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded-full">{stageJobs.length}</span>
            </h2>
            <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
              {stageJobs.map(job => (
                <div key={job.id} className="bg-background border border-white/10 p-4 rounded-lg flex flex-col gap-2 hover:border-white/30 transition-colors shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-foreground text-sm leading-tight">{job.job_title}</h3>
                    {job.match_score > 0 && (
                      <span className="text-xs font-mono font-bold bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">
                        {job.match_score}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{job.company}</p>
                  
                  {job.key_skills_match && job.key_skills_match.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.key_skills_match.slice(0, 3).map(skill => (
                        <span key={skill} className="text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-muted-foreground">
                          {skill}
                        </span>
                      ))}
                      {job.key_skills_match.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{job.key_skills_match.length - 3}</span>
                      )}
                    </div>
                  )}
                  
                  {job.niche_flag && (
                    <div className="mt-1 text-[10px] text-yellow-400/80 bg-yellow-400/10 w-fit px-1.5 rounded">Niche/Unconventional</div>
                  )}

                  <a href={job.application_link} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline mt-2 w-fit">
                    View Posting ↗
                  </a>
                </div>
              ))}
              {stageJobs.length === 0 && (
                <div className="text-xs text-muted-foreground/50 italic p-4 text-center border border-dashed border-white/10 rounded-lg">
                  No jobs in this stage.
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
