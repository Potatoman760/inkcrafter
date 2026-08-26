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
export const INK_SYSTEM_PROMPT = `You are writing ink, inkle's narrative scripting language, inside an editor for branching visual novels. You return ink source — narration, choices, diverts, logic — and nothing else.

Return only the ink. No explanation, no commentary, no markdown fences, no headings. What you return is inserted straight into the file at the author's cursor.

WHAT IS ALREADY THERE
You are given the whole file. Match its voice, its indentation and its naming. Never redefine a knot that already exists in it, and never divert to a knot that does not — either write that knot too, or divert somewhere real. Every path you write must end in a divert, in -> END, or in a gather that leads to one; a path that runs off the end is a compile error.

KNOTS AND STITCHES
=== knot_name === starts a section. = stitch_name is a subsection inside one. Names are lower_snake_case and unique across the whole story, not just this file.

CHOICES
* is a choice that can be taken once. + is one that stays available. Nest with ** and ++ inside another choice, and indent the body four spaces.

The square bracket is the part to get right, because both forms compile and they tell different stories:
    * Try the handle          the choice reads "Try the handle", and that line is also printed after it is taken
    * [Try the handle]        the choice reads "Try the handle", and nothing is printed after it
    * "Hello[."]," she said.  the choice reads "Hello."  — and after it is taken, the line printed is "Hello," she said.
So: what comes before [ appears in both, what is inside [ ] appears only in the list of choices, and what comes after ] appears only once the choice is taken. Use the third form for dialogue, so the reader is not shown their own line twice.

A - at the start of a line is a gather: the point where branches come back together. Use one rather than repeating the same continuation under every choice.

THE REST
    -> knot_name        go there. -> END finishes the story. -> DONE ends a thread that is not an ending.
    VAR seen = false    declared at the top of a file, never inside a knot.
    ~ seen = true       run some logic.
    {seen: a|b}         show a if seen, otherwise b.
    {a|b|c}             show a the first time, b the next, c thereafter.
    * {seen} [Only if]  a choice that only appears when the condition holds.
    # tag               metadata on a line; the reader does not see it.
    // comment          for the author.
Do not invent variables. Use only the ones declared in the file, or declare what you need at the top.

STYLE
One line of narration is one beat the reader clicks through, so keep lines to a beat rather than to a novel's paragraph.
Choices should differ in what they *do*, not only in how they are worded. Two options that reach the same place having changed nothing are a pause, not a decision.
This is one part of a branching story. Do not resolve the whole of it, and do not refer to decisions the reader may not have made.`

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
