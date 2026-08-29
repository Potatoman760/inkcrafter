import { readFile, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { isSafeInkProse } from '@shared/inkProse'
import { scanTags } from '@shared/inkTags'
import type { ProseNode } from '@shared/manuscript'
import { stripBom } from '../text'

/**
 * Putting drafted prose into the ink.
 *
 * Two operations, deliberately different in risk. Inserting adds lines and
 * destroys nothing. Replacing overwrites a span, so it is allowed only where
 * every line in that span is provably plain prose belonging to this section —
 * anything else in there is structure the author wrote and the draft does not
 * know about.
 */

export interface ComposeResult {
  ok: boolean
  message: string | null
}

/**
 * Splits a draft into paragraphs, discarding anything that would not survive
 * being written into ink.
 *
 * A paragraph becomes one line, so a paragraph the model wrapped over several
 * lines is joined back up first — otherwise each fragment would land as its own
 * beat. The hazard test is `inkHazardIn`, the same list the system prompt is
 * written from: a model told not to write ink syntax mostly obeys, and this is
 * for when it does not, since one stray line restructures the story.
 */
export function sanitiseDraft(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(isSafeInkProse)
}

/**
 * The line a source line's prose occupies, ignoring a trailing tag or comment,
 * or null when the line is not purely prose.
 *
 * This is stricter than the test for editing a single line. Editing replaces a
 * span *within* a line, so the chosen branch of `{a: x|y}` qualifies. Replacing
 * discards the whole line, which for that same conditional would throw away the
 * condition and the other branch.
 */
export function pureProseOf(line: string): string | null {
  const withoutComment = line.split('//')[0] ?? ''
  const withoutTag = withoutComment.split('#')[0] ?? ''
  const body = withoutTag.trim()

  if (body.length === 0) return null
  if (/^[*+\-=~]|^\{|->|<-|^INCLUDE\b|^VAR\b|^CONST\b|^LIST\b|^EXTERNAL\b/.test(body)) return null
  if (body.includes('{') || body.includes('}')) return null

  return body
}

function readLines(contents: string): { lines: string[]; newline: string } {
  return { lines: contents.split(/\r?\n/), newline: contents.includes('\r\n') ? '\r\n' : '\n' }
}

async function load(projectPath: string, file: string): Promise<string> {
  return stripBom(await readFile(join(projectPath, file.split('/').join(sep)), 'utf8'))
}

async function save(projectPath: string, file: string, contents: string): Promise<void> {
  await writeFile(join(projectPath, file.split('/').join(sep)), contents, 'utf8')
}

/**
 * Adds paragraphs after the last anchored line of a section. Purely additive:
 * whatever was there stays, and a bad draft is undone by deleting lines.
 */
export async function insertAfterSection(
  projectPath: string,
  nodes: ProseNode[],
  paragraphs: string[]
): Promise<ComposeResult> {
  const anchored = nodes.filter((node) => node.source !== null)
  const last = anchored[anchored.length - 1]

  if (!last?.source) {
    return {
      ok: false,
      message:
        'This section has no line in the source to attach to. Write the first line in the ink, then draft from there.'
    }
  }

  if (paragraphs.length === 0) {
    return { ok: false, message: 'The draft contained nothing usable.' }
  }

  const file = last.source.file
  const { lines, newline } = readLines(await load(projectPath, file))
  const at = last.source.line

  lines.splice(at, 0, '', ...paragraphs.join('\n\n').split('\n'))
  await save(projectPath, file, lines.join(newline))

  return { ok: true, message: null }
}

export interface ReplaceCheck {
  /** True when every line in the span is plain prose belonging to this section. */
  safe: boolean
  reason: string | null
  file: string | null
  from: number
  to: number
}

/**
 * Decides whether a section's source span can be overwritten wholesale.
 *
 * Refuses across files, and refuses when the span holds anything the draft
 * cannot account for — a conditional, a function call, a variable assignment.
 * Those are the author's structure sitting between their sentences.
 */
export function canReplaceSection(nodes: ProseNode[], linesOf: (file: string) => string[] | null): ReplaceCheck {
  const anchored = nodes.filter((node) => node.source !== null)
  if (anchored.length === 0) {
    return { safe: false, reason: 'This section has no lines in the source.', file: null, from: 0, to: 0 }
  }

  const files = new Set(anchored.map((node) => node.source!.file))
  if (files.size > 1) {
    return {
      safe: false,
      reason: 'This section is spread across more than one file, so it cannot be replaced as a block.',
      file: null,
      from: 0,
      to: 0
    }
  }

  const file = [...files][0]!
  const lines = linesOf(file)
  if (!lines) {
    return { safe: false, reason: 'The source file could not be read.', file, from: 0, to: 0 }
  }

  const numbers = anchored.map((node) => node.source!.line)
  const from = Math.min(...numbers)
  const to = Math.max(...numbers)

  // Tags first, because `pureProseOf` cannot catch them: it strips everything
  // after `#` before judging a line, so `She turns. # bg: harbour` passes the
  // prose test and the splice below then takes the tag away with the sentence.
  // Silent until the manuscript learned to show tags at all; now it would be an
  // author watching their staging vanish.
  const staged = scanTags(lines.join('\n')).filter((use) => use.line >= from && use.line <= to)
  const first = staged[0]
  if (first) {
    return {
      safe: false,
      reason: `Line ${first.line} carries # ${first.raw}, which replacing the section would discard. Insert instead, or edit the lines individually.`,
      file,
      from,
      to
    }
  }

  for (let line = from; line <= to; line++) {
    const text = lines[line - 1] ?? ''
    if (text.trim().length === 0) continue
    if (text.trim().startsWith('//')) continue
    if (pureProseOf(text) === null) {
      return {
        safe: false,
        reason: `Line ${line} is not plain prose — ${text.trim().slice(0, 60)} — so replacing the section would discard it. Insert instead, or edit the lines individually.`,
        file,
        from,
        to
      }
    }
  }

  return { safe: true, reason: null, file, from, to }
}

export async function replaceSection(
  projectPath: string,
  check: ReplaceCheck,
  paragraphs: string[]
): Promise<ComposeResult> {
  if (!check.safe || !check.file) return { ok: false, message: check.reason }
  if (paragraphs.length === 0) return { ok: false, message: 'The draft contained nothing usable.' }

  const { lines, newline } = readLines(await load(projectPath, check.file))
  lines.splice(check.from - 1, check.to - check.from + 1, ...paragraphs.join('\n\n').split('\n'))
  await save(projectPath, check.file, lines.join(newline))

  return { ok: true, message: null }
}
