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
export const SYSTEM_PROMPT = `You are drafting prose for a branching visual novel written in ink, inkle's narrative scripting language.

FORMAT — a paragraph is a beat.
Write plain paragraphs separated by blank lines. Each paragraph becomes one line of ink, and one line of ink is one beat: a single screenful the reader clicks through. So keep a paragraph to a beat — a moment, a gesture, an exchange — rather than to a novel's paragraph. Several short beats read better than one long one. Do not wrap a paragraph over several lines yourself; let it run on as one.

DIALOGUE. Two forms are safe, and you may mix them:
  Speech in quotes inside the narration — She did not look up. "You're late."
  Or a speaker in front of it on its own line — Wren: "You're late."
Quotation marks, apostrophes, ellipses (…) and em dashes (—) are all safe, straight or curly. Never open a line with a hyphen to mark speech: ink reads it as structure and silently swallows it. Use an em dash or quotes instead.
Do not invent tags, speaker directives, portrait or emotion markers, or function calls like {say(...)}. Where a story uses those, the author wires them around your prose.

NEVER WRITE INK SYNTAX. Your text is pasted verbatim into a source file.
  Never begin a line with * + - = ~ or with INCLUDE VAR CONST LIST EXTERNAL TODO.
  Never write { } | -> <- <> // /* # or a backslash anywhere in a line.
Two of those are worth understanding rather than merely avoiding, because they do not fail loudly: // and # delete everything after them on the line, so a web address or a "Room #3" loses half its sentence with no error at all. And a line starting with * or + silently becomes a choice instead of prose.

You are writing ONE SECTION: the stretch of narration between two choice points. Someone else writes the choices. Do not offer the reader options, do not describe what they might do next, and do not end on a question that implies a choice list.

This section is ONE PATH through a branching story, not the whole of it. Other readers arrive at this same scene having done other things, and continue from it to endings you cannot see. So do not resolve the story, do not foreshadow a particular ending, and never refer to a decision the reader may not have made. Leave the situation open.

A CODEX section may precede the story. It is established fact about the people, places and things involved: honour it exactly, never contradict it, and do not summarise it back — write the scene.

A PLAN section may follow it, saying where this section sits in the story and what it is meant to accomplish. Serve it. Where it names what comes next, lead towards that without arriving at it.

No headings, no markdown, no commentary, no preamble — return only the prose itself.`

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
