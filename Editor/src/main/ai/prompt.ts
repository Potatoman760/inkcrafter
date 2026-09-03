import prose from './prompts/prose.md?raw'
import type { CodexEntry } from '@shared/codex'
import {
  scanTextFor,
  sectionTextFor,
  selectCodexEntries,
  storyContextFor
} from '@shared/codexContext'
import { sectionsOf, type Manuscript } from '@shared/manuscript'
import { sectionKnot } from '@shared/plan'
import type { PlanDocument } from '@shared/planDoc'
import type { WriteSectionRequest } from '@shared/ai'
import { renderCodexContext } from './context'
import { renderPlanContext } from './planContext'

/**
 * The system prompt.
 *
 * Three things separate this from asking for a chapter of a novel, and each
 * costs the author real work when a model gets it wrong.
 *
 * **The output becomes source code.** Anything resembling ink syntax stops being
 * text and becomes structure. The bans come from
 * [inkProse.ts](../../shared/inkProse.ts), which was checked against the
 * compiler rather than written from memory — and the silent failures matter more
 * than the loud ones. A stray brace is a compile error the author sees at once;
 * a stray `//` or `#` quietly deletes the rest of the sentence, and a leading
 * `*` quietly turns a paragraph into a choice.
 *
 * **A paragraph is a beat.** Each paragraph lands as one line of ink, and one
 * line of ink is one thing the reader clicks through. A model writing
 * novel-length paragraphs is not writing badly, it is pacing badly, and "write
 * well" does not fix it. Saying so is the most useful formatting instruction
 * here.
 *
 * **It is one path, not the story.** A model that writes a satisfying ending, or
 * refers to what the reader "chose earlier", produces prose that reads well here
 * and wrongly on every other route through the same scene.
 */
/**
 * The shipped default, read from `prompts/prose.md`.
 *
 * The file is the source rather than a copy of one: it is inlined at build
 * time, so there is one text to edit and it is readable on its own — by an
 * author reading what the app ships, and by a tool working on this repo.
 *
 * `trimEnd` because a text file ends with a newline and a prompt does not.
 */
export const SYSTEM_PROMPT = prose.trimEnd()

export interface PromptSources {
  /** Replaces `SYSTEM_PROMPT` when the author has written their own. */
  system?: string
  codex?: CodexEntry[]
  libraryTitles?: Record<string, string>
  /** The project's plan, for where the section sits in the story. */
  plan?: PlanDocument | null
}

export function composePrompt(
  manuscript: Manuscript,
  request: WriteSectionRequest,
  sources: PromptSources = {}
): { system: string; user: string } {
  const { codex = [], libraryTitles = {}, plan = null } = sources
  const context = storyContextFor(manuscript, request.sectionIndex)
  const existing = sectionTextFor(manuscript, request.sectionIndex)
  const instruction = request.instruction.trim() || 'Continue the scene.'

  const parts = [
    context.length > 0
      ? `THE STORY SO FAR, along this path:\n\n${context}`
      : 'This is the opening of the story; nothing precedes it.',
    existing.length > 0
      ? `WHAT THIS SECTION SAYS NOW — you are rewriting this:\n\n${existing}`
      : 'This section is empty; you are writing it from nothing.',
    `INSTRUCTION FROM THE AUTHOR:\n\n${instruction}`,
    `Write at most ${request.maxWords} words.`
  ]

  const codexBlock = renderCodexContext(
    selectCodexEntries(scanTextFor(manuscript, request.sectionIndex, instruction), codex),
    libraryTitles
  )

  // Matched by the knot the section was read from, which is what ties a plan
  // node to the ink generated from — or named after — it.
  const section = sectionsOf(manuscript)[request.sectionIndex]
  const knot = section ? sectionKnot(section) : null
  const planBlock = plan ? renderPlanContext(plan, knot) : ''

  // Reference material before the task it supports.
  const user = [codexBlock, planBlock, ...parts].filter((part) => part.length > 0).join('\n\n---\n\n')

  return { system: sources.system ?? SYSTEM_PROMPT, user }
}
