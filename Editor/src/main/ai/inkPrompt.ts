import ink from './prompts/ink.md?raw'
import type { WriteInkRequest } from '@shared/ai'
import type { CodexEntry } from '@shared/codex'
import { selectCodexEntries } from '@shared/codexContext'
import { scanKnots } from '@shared/inkKnots'
import { planContextForFile } from '@shared/plan'
import { roleAtDepth, type PlanDocument } from '@shared/planDoc'
import { renderCodexContext } from './context'

/**
 * Asking a model to write ink.
 *
 * The mirror image of the drafting prompt. There, structure is forbidden because
 * the author owns the shape of the story; here structure is the whole request,
 * so the prompt has to actually teach ink rather than ban it.
 *
 * The part worth getting right is the choice bracket, which is the one piece of
 * ink syntax that fails *silently* — `* [Try the handle]` and `* Try the handle`
 * both compile, and produce a different story. Everything stated below about it
 * was run through the compiler, and [inkPrompt.test.ts](./inkPrompt.test.ts)
 * compiles the worked example and plays it to check the claim still holds.
 */
/**
 * The shipped default, read from `prompts/ink.md`. See `prompt.ts` for why the
 * markdown is the source rather than a copy.
 */
export const INK_SYSTEM_PROMPT = ink.trimEnd()

export interface InkPromptSources {
  /** Replaces `INK_SYSTEM_PROMPT` when the author has written their own. */
  system?: string
  codex?: CodexEntry[]
  libraryTitles?: Record<string, string>
  plan?: PlanDocument | null
}

/** The plan block, phrased around a file rather than a section. */
export function renderFilePlanContext(plan: PlanDocument, filePath: string): string {
  const context = planContextForFile(plan, filePath)
  if (!context) return ''

  const trim = (text: string): string => text.trim().replace(/\s*\n\s*/g, ' ').slice(0, 600)

  const lines = [
    'PLAN — what this file is for.',
    `${context.ancestry.map((node) => node.title || 'untitled').join(' › ')} (${context.role})`
  ]

  const own = trim(context.node.summary)
  if (own.length > 0) lines.push(`This ${context.role}: ${own}`)

  for (const [depth, ancestor] of context.ancestry.slice(0, -1).entries()) {
    const summary = trim(ancestor.summary)
    if (summary.length > 0) lines.push(`The ${roleAtDepth(depth)} "${ancestor.title}": ${summary}`)
  }

  if (context.node.tags.length > 0) lines.push(`Tags: ${context.node.tags.join(', ')}`)

  // A container's children explain the nearby story structure. A Scene has no
  // nested plan nodes: its app-managed Ink file belongs to that Scene alone.
  if (context.node.children.length > 0) {
    lines.push(`The ${roleAtDepth(context.ancestry.length)}s this file covers:`)
    for (const child of context.node.children) {
      const summary = trim(child.summary)
      lines.push(`  ${child.title}${summary.length > 0 ? ` — ${summary}` : ''}`)
    }
  }

  if (context.next) {
    const summary = trim(context.next.summary)
    lines.push(`What follows: ${context.next.title}${summary.length > 0 ? ` — ${summary}` : ''}`)
  }

  return lines.join('\n')
}

/** Keeps a very long file from crowding out the instruction. */
const MAX_SOURCE_CHARS = 24_000

export function composeInkPrompt(
  request: WriteInkRequest,
  sources: InkPromptSources = {}
): { system: string; user: string } {
  const { codex = [], libraryTitles = {}, plan = null } = sources
  const instruction = request.instruction.trim() || 'Continue this file.'
  const selection = request.selection.trim()

  const source =
    request.source.length > MAX_SOURCE_CHARS
      ? `${request.source.slice(0, MAX_SOURCE_CHARS)}\n// …the rest of the file is omitted.`
      : request.source

  // The knots already declared, named outright rather than left to be inferred
  // from the source: inventing a divert to a knot that does not exist is the
  // most common way an otherwise good draft fails to compile.
  const knots = scanKnots(request.source)
    .filter((knot) => !knot.isFunction)
    .map((knot) => knot.name)

  const parts = [
    `THE FILE — ${request.filePath}\n\n${source}`,
    knots.length > 0
      ? `KNOTS THAT ALREADY EXIST, which you may divert to and must not redefine:\n${knots.join(', ')}`
      : 'This file declares no knots yet.',
    selection.length > 0
      ? `THE AUTHOR HAS SELECTED THIS, and what you return will replace it:\n\n${selection}`
      : 'Nothing is selected; what you return will be inserted at the cursor.',
    `INSTRUCTION FROM THE AUTHOR:\n\n${instruction}`
  ]

  // Everything being sent is scanned, so a character named in the file arrives
  // with their description even when the instruction does not mention them.
  const scanned = [source, selection, instruction].join('\n\n')
  const codexBlock = renderCodexContext(selectCodexEntries(scanned, codex), libraryTitles)
  const planBlock = plan ? renderFilePlanContext(plan, request.filePath) : ''

  const user = [codexBlock, planBlock, ...parts].filter((part) => part.length > 0).join('\n\n---\n\n')

  return { system: sources.system ?? INK_SYSTEM_PROMPT, user }
}
