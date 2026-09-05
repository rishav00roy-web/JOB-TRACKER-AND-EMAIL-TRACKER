// Raw text extraction from an uploaded resume. PDF via pdf-parse v2
// (pdfjs under the hood, works on Vercel), DOCX via mammoth.

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export class UnsupportedResumeFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedResumeFileError'
  }
}

const PDF_MAGIC = '%PDF-'
const ZIP_MAGIC = 'PK'

// Sniff the real file signature. A .docx renamed to .pdf otherwise fails deep
// inside the parser with something unreadable.
function detectKind(buffer: Buffer, filename: string): 'pdf' | 'docx' {
  const head = buffer.subarray(0, 5).toString('latin1')
  if (head.startsWith(PDF_MAGIC)) return 'pdf'
  if (head.startsWith(ZIP_MAGIC)) return 'docx'

  const ext = filename.toLowerCase().split('.').pop()
  throw new UnsupportedResumeFileError(
    `"${filename}" is not a readable PDF or DOCX (its contents start with ${JSON.stringify(head)}${
      ext ? `, extension .${ext}` : ''
    }). Only .pdf and .docx are supported.`
  )
}

export async function extractResumeText(buffer: Buffer, filename: string): Promise<string> {
  const kind = detectKind(buffer, filename)

  let text: string
  if (kind === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
      const result = await parser.getText()
      text = result.text || ''
    } finally {
      await parser.destroy()
    }
  } else {
    const result = await mammoth.extractRawText({ buffer })
    text = result.value || ''
  }

  const cleaned = normalizeWhitespace(text)

  if (cleaned.length < 50) {
    throw new UnsupportedResumeFileError(
      kind === 'pdf'
        ? 'Almost no text came out of that PDF. It is probably a scan with no text layer — export a text-based PDF or upload the DOCX.'
        : 'Almost no text came out of that DOCX.'
    )
  }

  return cleaned
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
