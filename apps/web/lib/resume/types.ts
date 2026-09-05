export type ProfileBullet = {
  id: string
  text: string
}

export type ProfileExperience = {
  id: string
  company: string
  title: string
  startDate: string
  endDate: string
  location: string
  technologies: string[]
  bullets: ProfileBullet[]
}

export type ProfileEducation = {
  id: string
  institution: string
  degree: string
  field: string
  startDate: string
  endDate: string
}

export type ProfileCertification = {
  id: string
  name: string
  issuer: string
  date: string
}

export type CareerProfile = {
  personal: {
    name: string
    email: string
    phone: string
    location: string
    links: string[]
  }
  summary: { id: 'summary'; text: string }
  skills: string[]
  experience: ProfileExperience[]
  education: ProfileEducation[]
  certifications: ProfileCertification[]
  // 'extracted' until the user confirms the profile in the review UI.
  verification: 'extracted' | 'verified'
}

export type TailorMode = 'conservative' | 'balanced' | 'strong'

export type TailorChange = {
  id: string
  section: string
  company: string
  bulletLabel: string
  targetBulletId: string
  original: string
  updated: string
  keywordsAdded: string[]
  keywordsRemoved: string[]
  reason: string
  evidence: string
  status: 'pending' | 'accepted' | 'rejected'
}

export type TailorKeyword = {
  keyword: string
  importance: 'Required' | 'Preferred'
  before: number
  after: number
  location: string
  status: 'Verified' | 'Unverified' | 'Not found'
}

export type TailorResult = {
  jobTitle: string
  matchBefore: number
  matchAfter: number
  strongMatches: string[]
  stillMissing: { skill: string; note: string }[]
  changes: TailorChange[]
  keywords: TailorKeyword[]
  engine: 'ai' | 'local'
}
