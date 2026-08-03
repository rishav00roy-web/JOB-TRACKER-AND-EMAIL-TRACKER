export type Skill = {
  name: string
  weight: number
  category: 'agentic' | 'general'
}

export type ScrapedJobInput = {
  job_title: string
  company: string
  description: string // This is the raw text from the posting used for scoring
  location?: string
  work_type?: string
  company_tier?: string
  posted_date?: string
  application_link: string
  easy_apply?: boolean
  compensation_insight?: string
}

export type ScoredJobResult = Omit<ScrapedJobInput, 'description'> & {
  match_score: number
  key_skills_match: string[]
  experience_match_summary: string
  why_fits: string
  niche_flag: boolean
}

export function scoreJob(job: ScrapedJobInput, userSkills: Skill[]): ScoredJobResult {
  const textToScan = (job.job_title + ' ' + job.description).toLowerCase()
  
  let totalPossibleWeight = 0
  let achievedWeight = 0
  const matchedSkills: string[] = []

  userSkills.forEach(skill => {
    totalPossibleWeight += skill.weight
    const keyword = skill.name.toLowerCase()
    
    // basic word boundary check
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(textToScan) || textToScan.includes(keyword)) {
      achievedWeight += skill.weight
      matchedSkills.push(skill.name)
    }
  })

  // Normalize match score to 0-100
  const match_score = totalPossibleWeight > 0 
    ? Math.round((achievedWeight / totalPossibleWeight) * 100) 
    : 0

  // Niche flag: if score is low but title has unconventional terms
  const nicheKeywords = ['founder', 'founding', 'foia', 'investigator', 'hacker', 'creative', 'experimental']
  const isNiche = nicheKeywords.some(kw => job.job_title.toLowerCase().includes(kw))

  const experience_match_summary = `Matches ${matchedSkills.length} key skills in your profile.`
  const why_fits = matchedSkills.length > 0 
    ? `Strong keyword overlap with: ${matchedSkills.join(', ')}.`
    : `Low keyword overlap. ${isNiche ? 'Flagged as potential niche/unconventional role.' : ''}`

  const { description, ...rest } = job

  return {
    ...rest,
    match_score,
    key_skills_match: matchedSkills,
    experience_match_summary,
    why_fits,
    niche_flag: isNiche && match_score < 30
  }
}
