import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyAchievements,
  parseAchievements,
  serialiseAchievements,
  type AchievementDocument
} from '@shared/bundle/achievementDoc'
import type { Project } from '@shared/project'
import { stripBom } from './text'

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
  await writeFile(join(project.path, ACHIEVEMENTS_FILE), serialiseAchievements(doc), 'utf8')
}
