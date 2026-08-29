import { readFile } from 'node:fs/promises'
import { countMentions, findMentions } from '@shared/mentions'
import type { MentionCountRequest } from '@shared/types'
import type { Project } from '@shared/project'
import { listInkFiles } from './project'
import { stripBom } from './text'

/**
 * How often each codex entry is named, across the whole story.
 *
 * The count used to be taken from whichever file was open, which made it read
 * as a fact about the entry when it was a fact about the editor: a character
 * central to the story showed 0 while you happened to be looking at a chapter
 * she is not in.
 *
 * The same walk as the ink search, and the same reasoning — a project is a few
 * dozen files, which is milliseconds to read.
 */
export async function countMentionsAcross(
  project: Project,
  request: MentionCountRequest
): Promise<Record<string, number>> {
  const total: Record<string, number> = {}
  if (request.entries.length === 0) return total

  for (const file of await listInkFiles(project)) {
    // The buffer beats the disk, so the number keeps up with what is being
    // typed rather than with what was last saved.
    const unsaved = request.overrides?.[file.absolutePath]

    let source: string
    if (unsaved !== undefined) {
      source = unsaved
    } else {
      try {
        source = stripBom(await readFile(file.absolutePath, 'utf8'))
      } catch {
        // Skipped rather than failed, as `referencesTo` does with the same
        // walk: one unreadable file is not a reason to answer nothing.
        continue
      }
    }

    for (const [id, count] of Object.entries(countMentions(findMentions(source, request.entries)))) {
      total[id] = (total[id] ?? 0) + count
    }
  }

  return total
}
