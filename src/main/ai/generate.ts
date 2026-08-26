import type { Manuscript } from '@shared/manuscript'
import type { WriteSectionRequest, WriteSectionResult } from '@shared/ai'
import { apiKeyFor, loadSettings, providerById } from '../settings'
import { composePrompt, SYSTEM_PROMPT, type PromptSources } from './prompt'
import { promptFor } from '@shared/prompts'

interface ChatChoice {
  message?: { content?: unknown }
}

/**
 * Calls the provider's chat completions endpoint.
 *
 * In the main process, necessarily: the renderer has `connect-src 'none'` and
 * has never been given the API key.
 */
export async function writeSection(
  manuscript: Manuscript,
  request: WriteSectionRequest,
  sources: PromptSources = {}
): Promise<WriteSectionResult> {
  const settings = await loadSettings()
  const providerId = request.providerId || settings.activeProviderId
  if (!providerId) {
    return {
      ok: false,
      text: '',
      message: 'No AI provider is configured. Add one in Settings.',
      prompt: null
    }
  }

  const provider = await providerById(providerId)
  if (!provider) {
    return { ok: false, text: '', message: 'That provider no longer exists.', prompt: null }
  }

  const model = request.model || provider.model
  if (!model) {
    return { ok: false, text: '', message: 'No model is selected for this provider.', prompt: null }
  }

  const { system, user } = composePrompt(manuscript, request, {
    ...sources,
    system: promptFor('prose', SYSTEM_PROMPT, settings.prompts)
  })
  const key = await apiKeyFor(providerId)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Authorization'] = `Bearer ${key}`

  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '')

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        // Generous against the word limit, which the prompt states in words:
        // cutting a draft off mid-sentence is worse than letting it run long.
        max_tokens: Math.round(request.maxWords * 3),
        temperature: 0.9
      }),
      signal: AbortSignal.timeout(120_000)
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).trim()
      return {
        ok: false,
        text: '',
        message: `${response.status} ${detail || response.statusText}`,
        prompt: user
      }
    }

    const body: unknown = await response.json()
    const content = (body as { choices?: ChatChoice[] })?.choices?.[0]?.message?.content

    if (typeof content !== 'string' || content.trim().length === 0) {
      return { ok: false, text: '', message: 'The provider returned no text.', prompt: user }
    }

    return { ok: true, text: content.trim(), message: null, prompt: user }
  } catch (error) {
    return {
      ok: false,
      text: '',
      message: error instanceof Error ? error.message : String(error),
      prompt: user
    }
  }
}
