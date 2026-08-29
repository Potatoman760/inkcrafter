import { join, sep } from 'node:path'
import type { WriteInkRequest, WriteInkResult } from '@shared/ai'
import type { Project } from '@shared/project'
import { compileStory } from '../ink/compiler'
import { apiKeyFor, loadSettings, providerById } from '../settings'
import { composeInkPrompt, INK_SYSTEM_PROMPT, type InkPromptSources } from './inkPrompt'
import { promptFor } from '@shared/prompts'

/**
 * Drafting ink for the editor.
 *
 * Unlike prose, ink can be *wrong* in a way the author cannot see by reading it:
 * a divert to a knot that does not exist, a path that runs off the end. Both are
 * ordinary mistakes for a model to make and both stop the story compiling. So
 * the draft is compiled where it would land before it is offered.
 *
 * The result is reported, not enforced. A draft that does not compile is often
 * still most of what the author wanted, and refusing to show it would be worse
 * than showing it with the error attached.
 */

/** Models wrap code in fences however firmly they are asked not to. */
function stripFences(text: string): string {
  const fenced = /^\s*```(?:ink|inkle)?\r?\n([\s\S]*?)\r?\n?```\s*$/.exec(text)
  return (fenced?.[1] ?? text).trim()
}

/**
 * The file as it would be with the draft in it: over the selection when there is
 * one, appended otherwise. An approximation of where the cursor is, but the
 * right one for the two cases that actually happen.
 */
export function fileWithDraft(source: string, selection: string, draft: string): string {
  const target = selection.trim()
  if (target.length > 0) {
    const at = source.indexOf(target)
    if (at !== -1) return source.slice(0, at) + draft + source.slice(at + target.length)
  }
  return `${source.replace(/\s*$/, '')}\n\n${draft}\n`
}

export function checkCompiles(
  project: Project | null,
  request: WriteInkRequest,
  draft: string
): { compiles: boolean; compileError: string | null } {
  if (!project) return { compiles: false, compileError: null }

  const absolute = join(project.path, request.filePath.split('/').join(sep))
  const merged = fileWithDraft(request.source, request.selection, draft)

  try {
    // Compiled through the project's entry point with this file overridden, so
    // a divert into another file resolves the way it will once saved — the same
    // trick the editor uses, and for the same reason.
    const result = compileStory({
      filePath: join(project.path, project.main.split('/').join(sep)),
      overrides: { [absolute]: merged }
    })

    const error = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')
    return { compiles: !error, compileError: error ? error.message : null }
  } catch (cause) {
    return { compiles: false, compileError: cause instanceof Error ? cause.message : String(cause) }
  }
}

export async function writeInk(
  request: WriteInkRequest,
  project: Project | null,
  sources: InkPromptSources = {}
): Promise<WriteInkResult> {
  const fail = (message: string): WriteInkResult => ({
    ok: false,
    text: '',
    message,
    prompt: null,
    compiles: false,
    compileError: null
  })

  const settings = await loadSettings()
  const providerId = request.providerId || settings.activeProviderId
  if (!providerId) return fail('No AI provider is configured. Add one in Settings.')

  const provider = await providerById(providerId)
  if (!provider) return fail('That provider no longer exists.')

  const model = request.model || provider.model
  if (!model) return fail('No model is selected for this provider.')

  const { system, user } = composeInkPrompt(request, {
    ...sources,
    system: promptFor('ink', INK_SYSTEM_PROMPT, settings.prompts)
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
        // Lower than the prose drafter: this is structure, and an inventive
        // divert is a compile error rather than a happy accident.
        temperature: 0.6
      }),
      signal: AbortSignal.timeout(120_000)
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).trim()
      return {
        ...fail(`${response.status} ${detail || response.statusText}`),
        prompt: user
      }
    }

    const body: unknown = await response.json()
    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content

    if (typeof content !== 'string' || content.trim().length === 0) {
      return { ...fail('The provider returned no text.'), prompt: user }
    }

    const text = stripFences(content)
    const { compiles, compileError } = checkCompiles(project, request, text)

    return { ok: true, text, message: null, prompt: user, compiles, compileError }
  } catch (error) {
    return {
      ...fail(error instanceof Error ? error.message : String(error)),
      prompt: user
    }
  }
}
