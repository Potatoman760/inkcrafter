import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyMap, parseMap, serialiseMap, type MapDocument } from '@shared/bundle/mapDoc'
import { scanKnots, type KnotSource } from '@shared/inkKnots'
import { listInkFiles } from './project'
import type { Project } from '@shared/project'
import { stripBom } from './text'
import { writeWatched } from './watch'

/**
 * The maps, at `map.json` beside the other catalogues.
 *
 * The one catalogue that generates no ink. Stats and cast become `VAR`
 * declarations because the story reads them; a map is read only by the game, so
 * there is nothing for the compiler to see and nothing to keep in step. It is
 * written, and it is exported, and that is all.
 *
 * That cuts both ways now the file holds several maps that open each other:
 * nothing about a map is checked by the compiler, so `preflight` is the only
 * thing between "a picture the reader can never reach" and shipping it.
 */
const MAP_FILE = 'map.json'

export async function readMap(project: Project): Promise<MapDocument> {
  try {
    return parseMap(stripBom(await readFile(join(project.path, MAP_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyMap()
  }
}

export async function writeMap(project: Project, doc: MapDocument): Promise<void> {
  await writeWatched(join(project.path, MAP_FILE), serialiseMap(doc))
}

/**
 * Every knot in the project, for choosing a destination from a list.
 *
 * Scanned across every `.ink` file rather than compiled, because a map is often
 * laid out while the story around it is half-written and would not compile.
 * Being unable to point at a knot until the whole story is valid would make
 * this useless exactly when it is most wanted.
 */
export async function listDestinations(project: Project): Promise<KnotSource[]> {
  const files = await listInkFiles(project)
  const found: KnotSource[] = []
  const seen = new Set<string>()

  for (const file of files) {
    let source: string
    try {
      source = stripBom(await readFile(file.absolutePath, 'utf8'))
    } catch {
      continue
    }
    for (const knot of scanKnots(source)) {
      if (knot.isFunction || seen.has(knot.name)) continue
      seen.add(knot.name)
      found.push({ knot: knot.name, file: file.path })
    }
  }

  // File, then declaration order — not alphabetical. Which file a knot came
  // from is what says which Scene it belongs to, and the order inside a file is
  // the order it was written in, which is the order worth offering a Scene's
  // knots in. Anything wanting a flat alphabetical list sorts it where it needs
  // one, which is one line at the two places that do.
  return found
}
