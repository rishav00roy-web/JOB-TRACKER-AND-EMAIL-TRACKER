// CareerProfile -> PDF buffer, using pdfkit's built-in Helvetica.
// Same single-column, no-tables layout as the DOCX for ATS friendliness.

import PDFDocument from 'pdfkit'
import type { CareerProfile } from './types'

const ACCENT = '#1F3A5F'
const MUTED = '#595959'
const MARGIN = 48

function dateRange(start: string, end: string) {
  return [start, end].filter(Boolean).join(' – ')
}

// Experience entries show duration ("5 years") instead of literal start–end
// dates — a deliberate resume-writing choice (keeps focus on how long, not
// exactly when), not an omission. Education keeps real dates via dateRange.
function experienceDuration(start: string, end: string) {
  if (!start) return dateRange(start, end)
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return dateRange(start, end)

  const totalMonths = Math.max(
    0,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
  )
  if (totalMonths < 12) {
    const m = Math.max(1, totalMonths)
    return `${m} month${m === 1 ? '' : 's'}`
  }
  const years = Math.round(totalMonths / 12)
  return `${years} year${years === 1 ? '' : 's'}`
}

export async function generatePdf(profile: CareerProfile): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN })

  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const contentWidth = doc.page.width - MARGIN * 2

  const sectionHeading = (text: string) => {
    doc.moveDown(0.7)
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(text.toUpperCase())
    const y = doc.y + 2
    doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).lineWidth(0.8).strokeColor(ACCENT).stroke()
    doc.moveDown(0.5)
  }

  // Title + role on one line, dates right-aligned on the same baseline.
  const roleLine = (left: string, right: string) => {
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(left, MARGIN, y, { width: contentWidth - 130 })
    if (right) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(right, MARGIN + contentWidth - 130, y, {
        width: 130,
        align: 'right',
      })
    }
    doc.y = Math.max(doc.y, y + 12)
  }

  doc.font('Helvetica-Bold').fontSize(20).fillColor(ACCENT).text(profile.personal.name || 'Resume', { align: 'center' })

  const contact = [profile.personal.email, profile.personal.phone, profile.personal.location, ...profile.personal.links]
    .filter(Boolean)
    .join('  •  ')

  if (contact) {
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(contact, { align: 'center' })
  }

  if (profile.summary?.text) {
    sectionHeading('Summary')
    doc.font('Helvetica').fontSize(10).fillColor('black').text(profile.summary.text, { align: 'left' })
  }

  if (profile.skills?.length) {
    sectionHeading('Skills')
    doc.font('Helvetica').fontSize(10).fillColor('black').text(profile.skills.join('  •  '))
  }

  if (profile.experience?.length) {
    sectionHeading('Experience')
    for (const exp of profile.experience) {
      roleLine([exp.title, exp.company].filter(Boolean).join(' — '), experienceDuration(exp.startDate, exp.endDate))

      const sub = [exp.location, exp.technologies?.join(', ')].filter(Boolean).join('  •  ')
      if (sub) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(sub)
      }

      doc.moveDown(0.2)
      for (const bullet of exp.bullets || []) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('black')
          .text(bullet.text, { indent: 12, align: 'left', listType: 'bullet' } as PDFKit.Mixins.TextOptions)
      }
      doc.moveDown(0.3)
    }
  }

  if (profile.education?.length) {
    sectionHeading('Education')
    for (const edu of profile.education) {
      roleLine(
        [edu.degree, edu.field].filter(Boolean).join(', ') || edu.institution,
        dateRange(edu.startDate, edu.endDate)
      )
      if (edu.degree && edu.institution) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(edu.institution)
      }
    }
  }

  if (profile.certifications?.length) {
    sectionHeading('Certifications')
    for (const cert of profile.certifications) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('black')
        .text([cert.name, cert.issuer, cert.date].filter(Boolean).join(' — '))
    }
  }

  doc.end()
  return done
}
