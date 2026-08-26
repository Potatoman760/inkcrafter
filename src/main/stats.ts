import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { emptyStats, parseStats, serialiseStats, type StatsDocument } from '@shared/statsDoc'
import { emptyNpcs, parseNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import { buildExport, EXPORT_FILE, serialiseExport } from '@shared/statsExport'
import { includePathFrom, renderStateInk, STATE_FILE, withStateInclude } from '@shared/statsInk'
import type { Project } from '@shared/project'
import { stripBom } from './text'

/**
 * The catalogue lives at `stats.json` in the project directory, beside
 * `plan.json` — the app's own document, in the app's own format.
 *
 * Writing it does two things, and the second is the one that matters: the
 * declarations are regenerated into `ink/state.ink` and the entry point is made
 * to INCLUDE it. A catalogue the story cannot see would be a list of names that
 * compile to nothing, so the two are saved together or not at all.
 */
const STATS_FILE = 'stats.json'

export async function readStats(project: Project): Promise<StatsDocument> {
  try {
    return parseStats(stripBom(await readFile(join(project.path, STATS_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyStats()
  }
}

export interface WriteStatsResult {
  /** Project-relative paths written, so the renderer can reload what it shows. */
  written: string[]
}

export async function writeStats(
  project: Project,
  doc: StatsDocument,
  npcs?: NpcDocument
): Promise<WriteStatsResult> {
  const written: string[] = []
  const absolute = (path: string): string => join(project.path, path.split('/').join(sep))

  await writeFile(absolute(STATS_FILE), serialiseStats(doc), 'utf8')
  written.push(STATS_FILE)

  // `state.ink` holds the declarations from *both* catalogues, so saving one
  // has to read the other. Passed in when the caller already has it, to avoid
  // a save racing a read of the file it is about to regenerate from.
  const cast = npcs ?? (await readNpcsBeside(project))

  const statePath = absolute(STATE_FILE)
  await mkdir(dirname(statePath), { recursive: true })
  await writeFile(statePath, renderStateInk(doc, cast), 'utf8')
  written.push(STATE_FILE)

  // Regenerated with the ink rather than on demand, so the two can never
  // disagree about what the story contains.
  const exportPath = absolute(EXPORT_FILE)
  await mkdir(dirname(exportPath), { recursive: true })
  await writeFile(exportPath, serialiseExport(buildExport(doc)), 'utf8')
  written.push(EXPORT_FILE)

  if (await addIncludeToEntry(project)) written.push(project.main)

  return { written }
}

/**
 * Points the entry point at the generated declarations, if it does not already.
 *
 * Read and rewritten rather than assumed, because the author owns that file. A
 * missing entry point is not an error worth failing the save for — the
 * catalogue and the declarations are both on disk, and the include can be added
 * by hand or by the next save once the file exists.
 */
async function addIncludeToEntry(project: Project): Promise<boolean> {
  const path = join(project.path, project.main.split('/').join(sep))

  let source: string
  try {
    source = stripBom(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }

  const next = withStateInclude(source, project.main)
  if (next === source) return false

  await writeFile(path, next, 'utf8')
  return true
}

/**
 * The cast catalogue, read from beside the stats.
 *
 * Read here rather than imported from `npcs.ts`, which saves *through* this
 * module — going the other way would be a cycle for the sake of four lines.
 */
async function readNpcsBeside(project: Project): Promise<NpcDocument> {
  try {
    return parseNpcs(stripBom(await readFile(join(project.path, 'npcs.json'), 'utf8')))
  } catch {
    return emptyNpcs()
  }
}

/** Where the entry point would reach the declarations, for showing in the UI. */
export function includePathFor(project: Project): string {
  return includePathFrom(project.main)
}
