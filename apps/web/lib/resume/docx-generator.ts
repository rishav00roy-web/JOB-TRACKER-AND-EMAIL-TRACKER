// CareerProfile -> .docx buffer, using the `docx` library.
// Plain single-column layout: ATS parsers choke on tables and text boxes.

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx'
import type { CareerProfile } from './types'

const ACCENT = '1F3A5F'

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 260, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: ACCENT })],
  })
}

function bodyParagraph(text: string, opts: { bold?: boolean; italics?: boolean; spacingAfter?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter ?? 60 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: 20 })],
  })
}

// Title on the left, dates flushed right via a right-aligned tab stop.
function roleLine(left: string, right: string) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
    spacing: { before: 140, after: 20 },
    children: [
      new TextRun({ text: left, bold: true, size: 20 }),
      new TextRun({ text: `\t${right}`, size: 20, color: '595959' }),
    ],
  })
}

function dateRange(start: string, end: string) {
  return [start, end].filter(Boolean).join(' – ')
}

export async function generateDocx(profile: CareerProfile): Promise<Buffer> {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: profile.personal.name || 'Resume', bold: true, size: 36, color: ACCENT })],
    })
  )

  const contact = [profile.personal.email, profile.personal.phone, profile.personal.location, ...profile.personal.links]
    .filter(Boolean)
    .join('  •  ')

  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: contact, size: 18, color: '595959' })],
      })
    )
  }

  if (profile.summary?.text) {
    children.push(sectionHeading('Summary'))
    children.push(bodyParagraph(profile.summary.text))
  }

  if (profile.skills?.length) {
    children.push(sectionHeading('Skills'))
    children.push(bodyParagraph(profile.skills.join('  •  ')))
  }

  if (profile.experience?.length) {
    children.push(sectionHeading('Experience'))
    for (const exp of profile.experience) {
      children.push(roleLine([exp.title, exp.company].filter(Boolean).join(' — '), dateRange(exp.startDate, exp.endDate)))

      const sub = [exp.location, exp.technologies?.join(', ')].filter(Boolean).join('  •  ')
      if (sub) children.push(bodyParagraph(sub, { italics: true, spacingAfter: 40 }))

      for (const bullet of exp.bullets || []) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: [new TextRun({ text: bullet.text, size: 20 })],
          })
        )
      }
    }
  }

  if (profile.education?.length) {
    children.push(sectionHeading('Education'))
    for (const edu of profile.education) {
      children.push(
        roleLine(
          [edu.degree, edu.field].filter(Boolean).join(', ') || edu.institution,
          dateRange(edu.startDate, edu.endDate)
        )
      )
      if (edu.degree && edu.institution) children.push(bodyParagraph(edu.institution, { italics: true }))
    }
  }

  if (profile.certifications?.length) {
    children.push(sectionHeading('Certifications'))
    for (const cert of profile.certifications) {
      children.push(bodyParagraph([cert.name, cert.issuer, cert.date].filter(Boolean).join(' — ')))
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
