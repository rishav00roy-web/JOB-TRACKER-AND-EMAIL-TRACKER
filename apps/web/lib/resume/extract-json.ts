// Models wrap JSON in prose or code fences more often than they should.
// Strip the common wrappers, then fall back to brace-matching the first
// balanced object in the string.

export function extractJsonObject(raw: string): unknown {
  const text = raw.trim()

  const direct = tryParse(text)
  if (direct !== undefined) return direct

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim())
    if (parsed !== undefined) return parsed
  }

  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in response.')

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const parsed = tryParse(text.slice(start, i + 1))
        if (parsed !== undefined) return parsed
        break
      }
    }
  }

  throw new Error('Could not extract a balanced JSON object from response.')
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
