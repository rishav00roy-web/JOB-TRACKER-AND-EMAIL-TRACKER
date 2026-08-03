import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function syncEmails() {
  const supabase = getSupabase()
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables")
  }

  // 1. Fetch active jobs (Applied or Interview stages)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .in('stage', ['applied', 'interview'])

  if (error || !jobs || jobs.length === 0) {
    console.log("No active jobs to track.")
    return { status: "No active jobs to track.", updated: 0 }
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false
  })

  let updatedCount = 0

  await client.connect()

  // Use a lock to ensure we can safely interact with the INBOX
  let lock = await client.getMailboxLock('INBOX')
  try {
    // Only search emails from the last 7 days
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - 7)

    // Fetch UIDs of messages from the last 7 days
    const messages = client.fetch({ since: sinceDate }, { source: true, envelope: true })

    for await (let msg of messages) {
      if (!msg.source) continue

      const parsedMail = await simpleParser(msg.source)
      const subject = (parsedMail.subject || '').toLowerCase()
      const text = (parsedMail.text || '').toLowerCase()
      const from = parsedMail.from?.text.toLowerCase() || ''
      const allText = `${subject} ${text} ${from}`

      for (const job of jobs) {
        // Simple company matching: check if company name is in the email subject or sender
        const companyName = job.company.toLowerCase()
        if (subject.includes(companyName) || from.includes(companyName)) {
          // Intent parsing
          let newStage = null
          
          if (allText.includes('offer') || allText.includes('congratulations') || allText.includes('package')) {
            newStage = 'offer'
          } else if (allText.includes('interview') || allText.includes('schedule') || allText.includes('next steps') || allText.includes('chat')) {
            newStage = 'interview'
          } else if (allText.includes('unfortunately') || allText.includes('other candidates') || allText.includes('not moving forward') || allText.includes('declined')) {
            newStage = 'rejected'
          }

          if (newStage && job.stage !== newStage) {
            console.log(`Moving job ${job.id} to ${newStage} based on email.`)
            await supabase
              .from('jobs')
              .update({ stage: newStage })
              .eq('id', job.id)
            
            // Update local copy so we don't move it again
            job.stage = newStage
            updatedCount++
          }
        }
      }
    }
  } finally {
    lock.release()
  }

  await client.logout()

  return { status: "Success", updated: updatedCount }
}
