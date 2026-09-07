// OpenRouter client. Single-user tracker, so the key comes from the
// environment rather than a settings UI. Same var the Python scraper uses.

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5'
const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function hasApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('OPENROUTER_API_KEY is not set. Add it to .env.local to enable AI parsing and tailoring.')
    this.name = 'AiNotConfiguredError'
  }
}

async function callChatCompletion(messages: ChatMessage[], opts: { json?: boolean; model?: string } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new AiNotConfiguredError()

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      messages,
      temperature: 0.1,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned an empty completion.')
  }
  return content
}

// Two attempts: transient 5xx / rate limits are common enough on OpenRouter
// that a single retry saves a lot of failed tailoring runs.
export async function callChatCompletionWithRetry(messages: ChatMessage[], opts: { json?: boolean; model?: string } = {}) {
  try {
    return await callChatCompletion(messages, opts)
  } catch (err) {
    if (err instanceof AiNotConfiguredError) throw err
    await new Promise((r) => setTimeout(r, 1200))
    return callChatCompletion(messages, opts)
  }
}
