'use client'

import { useState } from 'react'
import { TailorPanel } from '@/components/tailor-panel'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
  // AI-role match often lands ~35-60%, not 80+. Tiers are glow intensity on
  // the one accent, not a second hue.
  const tier = score >= 60 ? 'strong' : score >= 35 ? 'good' : 'weak'
  const strokeOpacity = tier === 'weak' ? '0.4' : '1'
  const glowClass = tier === 'strong' ? 'drop-shadow-[0_0_5px_var(--color-primary)]' : ''

  return (
    <div className="relative flex items-center justify-center w-9 h-9 shrink-0">
      <svg className="w-9 h-9 -rotate-90">
        <circle cx="18" cy="18" r={radius} className="stroke-foreground/10" strokeWidth="2.5" fill="transparent" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${glowClass}`}
          stroke="var(--color-primary)"
          strokeOpacity={strokeOpacity}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono tabular-nums text-foreground">{score}</span>
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

      {/* Mobile-only hint that more stage columns exist off-screen. Tailwind's
          top-1/2 + translate utilities weren't resolving correctly in this
          project (unclear why — verified via computed style, not a stale
          cache); inline style sidesteps it rather than fighting the tool. */}
      <div
        className="sm:hidden fixed z-10 flex items-center gap-1 rounded-full bg-popover/90 backdrop-blur-md px-2.5 py-1.5 pointer-events-none animate-pulse ring-1 ring-border"
        style={{ top: '50%', right: '12px', transform: 'translateY(-50%)' }}
        aria-hidden="true"
      >
        <span className="text-[10px] font-mono text-muted-foreground">swipe</span>
        <span className="text-primary text-xs">→</span>
      </div>

      <div className="flex h-screen w-full overflow-x-auto overflow-y-hidden bg-background p-6 gap-6">
        {STAGES.map((stage) => {
          const stageJobs = jobs.filter((j) => j.stage === stage)
          return (
            <div key={stage} className="flex flex-col flex-shrink-0 w-[340px]">
              <div className="flex items-center justify-between mb-3 px-0.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
                  {stage}
                </h2>
                <Badge variant="outline" className="font-mono text-muted-foreground">
                  {stageJobs.length}
                </Badge>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-10">
                {stageJobs.map((job) => (
                  <Card
                    key={job.id}
                    className="shrink-0 gap-3 ring-border transition-shadow duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:ring-primary/40 hover:shadow-[0_8px_24px_-10px_var(--color-primary)]"
                  >
                    <CardHeader className="px-4">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex flex-col min-w-0">
                          <h3 className="font-semibold text-foreground text-sm leading-snug truncate">
                            {job.job_title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{job.company}</p>
                        </div>
                        {job.match_score > 0 && <ScoreRing score={job.match_score} />}
                      </div>
                    </CardHeader>

                    <CardContent className="px-4 flex flex-col gap-2.5">
                      {job.key_skills_match && job.key_skills_match.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {job.key_skills_match.slice(0, 4).map((skill) => (
                            <Badge
                              key={skill}
                              variant="outline"
                              className="font-mono border-primary/25 bg-primary/8 text-primary"
                            >
                              {skill}
                            </Badge>
                          ))}
                          {job.key_skills_match.length > 4 && (
                            <span className="text-[10px] font-mono text-muted-foreground self-center">
                              +{job.key_skills_match.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {job.clearance_required && (
                        <div
                          className="flex items-center gap-1.5 w-fit"
                          title="Requires U.S. government clearance or citizenship verification"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-destructive" aria-hidden="true" />
                          <span className="text-[10px] font-mono text-destructive">Clearance required</span>
                        </div>
                      )}

                      {job.niche_flag && !job.clearance_required && (
                        <div className="flex items-center gap-1.5 w-fit">
                          <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" aria-hidden="true" />
                          <span className="text-[10px] font-mono text-secondary-foreground">Niche opportunity</span>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="px-4 flex items-center justify-between gap-2 border-t-0 bg-transparent">
                      <Button
                        variant="link"
                        size="sm"
                        className="px-0 h-auto text-muted-foreground font-mono"
                        nativeButton={false}
                        render={<a href={job.application_link} target="_blank" rel="noopener noreferrer" />}
                      >
                        View posting <span aria-hidden="true">↗</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTailoring(job)}
                        title={job.description ? 'Tailor your resume to this posting' : 'No description stored — you can paste one'}
                        className="font-mono uppercase tracking-wide text-primary border-primary/25 hover:bg-primary/10"
                      >
                        Tailor
                      </Button>
                    </CardFooter>
                  </Card>
                ))}

                {stageJobs.length === 0 && (
                  <div className="flex items-center justify-center h-24 border border-dashed border-border rounded-xl bg-muted/30">
                    <span className="text-xs font-mono text-muted-foreground/60">No jobs yet</span>
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
