import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyMinigames,
  parseMinigames,
  serialiseMinigames,
  type MinigameDocument
} from '@shared/bundle/minigameDoc'
import type { Project } from '@shared/project'
import { stripBom } from './text'

export const MINIGAMES_FILE = 'minigames.json'

export async function readMinigames(project: Project): Promise<MinigameDocument> {
  try {
    return parseMinigames(stripBom(await readFile(join(project.path, MINIGAMES_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyMinigames()
  }
}

export async function writeMinigames(project: Project, doc: MinigameDocument): Promise<void> {
  await writeFile(join(project.path, MINIGAMES_FILE), serialiseMinigames(doc), 'utf8')
}

