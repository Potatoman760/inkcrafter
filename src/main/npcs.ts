import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyNpcs, parseNpcs, serialiseNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import type { Project } from '@shared/project'
import { readStats, writeStats } from './stats'
import { stripBom } from './text'

/**
 * The cast catalogue, at `npcs.json` beside `stats.json` and `media.json`.
 *
 * Saving it does the same second thing saving the stats does, and for the same
 * reason: the declarations are regenerated into `ink/state.ink`. A catalogue the
 * story cannot see would be a list of names that compile to nothing.
 *
 * The regeneration goes through `writeStats`, which writes the whole file from
 * both catalogues. That indirection is the point — `state.ink` is generated
 * *once*, from everything, so there is never a moment when one half has been
 * written and the other has not.
 */
const NPCS_FILE = 'npcs.json'

export async function readNpcs(project: Project): Promise<NpcDocument> {
  try {
    return parseNpcs(stripBom(await readFile(join(project.path, NPCS_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyNpcs()
  }
}

export interface WriteNpcsResult {
  /** Project-relative paths written, so the renderer can reload what it shows. */
  written: string[]
}

export async function writeNpcs(project: Project, doc: NpcDocument): Promise<WriteNpcsResult> {
  await writeFile(join(project.path, NPCS_FILE), serialiseNpcs(doc), 'utf8')

  // Re-saving the stats regenerates `state.ink` from both catalogues at once.
  const stats = await readStats(project)
  const { written } = await writeStats(project, stats, doc)

  return { written: [NPCS_FILE, ...written] }
}
