import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyAchievements,
  parseAchievements,
  serialiseAchievements,
  type AchievementDocument
} from '@shared/bundle/achievementDoc'
import type { Project } from '@shared/project'
import { stripBom } from './text'
import { writeWatched } from './watch'

const ACHIEVEMENTS_FILE = 'achievements.json'

export async function readAchievements(project: Project): Promise<AchievementDocument> {
  try {
    return parseAchievements(stripBom(await readFile(join(project.path, ACHIEVEMENTS_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyAchievements()
  }
}

export async function writeAchievements(
  project: Project,
  doc: AchievementDocument
): Promise<void> {
  await writeWatched(join(project.path, ACHIEVEMENTS_FILE), serialiseAchievements(doc))
}
