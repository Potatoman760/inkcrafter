import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyGame, parseGame, serialiseGame, type GameDocument } from '@shared/bundle/gameDoc'
import type { Project } from '@shared/project'
import { stripBom } from './text'

/**
 * The game's own settings, at `game.json` beside the other catalogues.
 *
 * Like `map.json`, it generates no ink: nothing in the story reads it, so there
 * is nothing for the compiler to see and nothing to keep in step. It is
 * written, it is exported, and the player reads it before the story starts.
 */
const GAME_FILE = 'game.json'

export async function readGame(project: Project): Promise<GameDocument> {
  try {
    return parseGame(stripBom(await readFile(join(project.path, GAME_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // A project written before this file existed is not broken, it just has
    // the defaults — the same answer every other catalogue gives when missing.
    return emptyGame()
  }
}

export async function writeGame(project: Project, doc: GameDocument): Promise<void> {
  await writeFile(join(project.path, GAME_FILE), serialiseGame(doc), 'utf8')
}
