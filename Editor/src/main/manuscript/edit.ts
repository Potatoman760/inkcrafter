import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { EDITABLE, type Editability, type SourceAnchor } from '@shared/manuscript'
import { stripBom } from '../text'

/**
 * Writing the manuscript back into the ink.
 *
 * The ink file stays the only save format — the manuscript and the editor are
 * two windows onto the same text. So an edit here is a replacement of the exact
 * span in the exact line that produced the rendered text, never a regeneration
 * of the file.
 *
 * That is only sound when the mapping is provably one-to-one, which is what
 * `locate` establishes.
 */

/**
 * The span of `line` holding `rendered`, or null when it cannot be pinned down.
 *
 * Requiring exactly one occurrence is the whole safety argument. Zero means the
 * runtime built the text rather than reading it — a conditional branch, an
 * interpolation, a function result — and there is nothing in the file to
 * replace. More than one means the replacement would be a guess.
 */
export function locate(line: string, rendered: string): [number, number] | null {
  const needle = rendered.trim()
  if (needle.length === 0) return null

  const first = line.indexOf(needle)
  if (first === -1) return null
  if (line.indexOf(needle, first + 1) !== -1) return null

  return [first, first + needle.length]
}

export function editabilityOf(line: string | undefined, rendered: string): Editability {
  if (line === undefined) {
    return { editable: false, reason: 'The source line could not be found.' }
  }

  const span = locate(line, rendered)
  if (span) return EDITABLE

  if (line.indexOf(rendered.trim()) !== -1) {
    return {
      editable: false,
      reason: 'This text appears more than once on its source line, so an edit could not be placed exactly.'
    }
  }

  return {
    editable: false,
    reason:
      'The runtime built this text rather than reading it from the file — a condition, an alternative, an interpolated value or a function result — so there is no single line to rewrite. Edit it in the ink.'
  }
}

/** Reads a project file, caching within one manuscript build. */
export class SourceCache {
  private readonly files = new Map<string, string[]>()

  constructor(private readonly projectPath: string) {}

  lines(file: string): string[] | null {
    const cached = this.files.get(file)
    if (cached) return cached

    try {
      const contents = readFileSync(join(this.projectPath, file.split('/').join(sep)), 'utf8')
      const lines = stripBom(contents).split(/\r?\n/)
      this.files.set(file, lines)
      return lines
    } catch {
      return null
    }
  }

  lineAt(anchor: SourceAnchor | null): string | undefined {
    if (!anchor) return undefined
    return this.lines(anchor.file)?.[anchor.line - 1]
  }
}

export interface ApplyEditResult {
  ok: boolean
  message: string | null
}

/**
 * Replaces `previous` with `next` at `anchor`, refusing unless the span is still
 * exactly where it was. The file may have moved under us — edited in the other
 * view, or by another program — and a stale anchor must not overwrite whatever
 * now occupies that line.
 */
export async function applyEdit(
  projectPath: string,
  anchor: SourceAnchor,
  previous: string,
  next: string
): Promise<ApplyEditResult> {
  const path = join(projectPath, anchor.file.split('/').join(sep))

  let contents: string
  try {
    contents = stripBom(await readFile(path, 'utf8'))
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  // Preserved so a file written with CRLF stays that way.
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const lines = contents.split(/\r?\n/)
  const line = lines[anchor.line - 1]

  if (line === undefined) {
    return { ok: false, message: 'That line no longer exists. Reread the manuscript and try again.' }
  }

  const span = locate(line, previous)
  if (!span) {
    return {
      ok: false,
      message: 'The source line has changed since it was read. Reread the manuscript and try again.'
    }
  }

  const replacement = next.trim()
  if (replacement.length === 0) {
    return { ok: false, message: 'A line cannot be emptied from the manuscript. Edit it in the ink.' }
  }

  lines[anchor.line - 1] = line.slice(0, span[0]) + replacement + line.slice(span[1])
  await writeFile(path, lines.join(newline), 'utf8')

  return { ok: true, message: null }
}
