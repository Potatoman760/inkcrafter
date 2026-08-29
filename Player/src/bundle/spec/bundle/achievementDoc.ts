// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import { newId } from '../ids'

export type AchievementValue = number | boolean | string
export type AchievementComparison = '==' | '!=' | '>' | '>=' | '<' | '<='

export const ACHIEVEMENT_COMPARISONS: readonly AchievementComparison[] = [
  '==', '!=', '>', '>=', '<', '<='
]

export interface Achievement {
  /** Stable editor identity; Steam identity is `apiName`. */
  id: string
  /** Steamworks Achievement API Name, configured in Steamworks partner tools. */
  apiName: string
  /** Author-facing labels, useful beside otherwise opaque API names. */
  name: string
  description: string
  /** An Ink global declared by stats.json or npcs.json. */
  variable: string
  comparison: AchievementComparison
  value: AchievementValue
}

export interface AchievementDocument {
  version: 1
  achievements: Achievement[]
}

export function emptyAchievements(): AchievementDocument {
  return { version: 1, achievements: [] }
}

export function newAchievement(): Achievement {
  return {
    id: newId('ach'),
    apiName: '',
    name: 'New achievement',
    description: '',
    variable: '',
    comparison: '==',
    value: true
  }
}

export function updateAchievement(
  doc: AchievementDocument,
  id: string,
  changes: Partial<Achievement>
): AchievementDocument {
  return {
    ...doc,
    achievements: doc.achievements.map((achievement) =>
      achievement.id === id ? normaliseAchievement({ ...achievement, ...changes }) : achievement
    )
  }
}

/** Pure runtime predicate shared by editor validation and the player. */
export function achievementMatches(
  actual: unknown,
  comparison: AchievementComparison,
  expected: AchievementValue
): boolean {
  if (typeof actual !== typeof expected) return false
  if (comparison === '==') return actual === expected
  if (comparison === '!=') return actual !== expected
  if (typeof actual !== 'number' || typeof expected !== 'number') return false
  if (comparison === '>') return actual > expected
  if (comparison === '>=') return actual >= expected
  if (comparison === '<') return actual < expected
  return actual <= expected
}

export function achievementApiNameProblem(
  doc: AchievementDocument,
  apiName: string,
  exceptId?: string
): string | null {
  const clean = apiName.trim()
  if (!clean) return 'Enter the API Name configured for this achievement in Steamworks.'
  if (!/^[A-Za-z0-9_]+$/.test(clean)) return 'Use only letters, numbers and underscores.'
  if (doc.achievements.some((one) => one.apiName === clean && one.id !== exceptId)) {
    return `${clean} is already used by another achievement.`
  }
  return null
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function readValue(value: unknown): AchievementValue | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readAchievement(value: unknown): Achievement | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const expected = readValue(record['value'])
  if (expected === null) return null
  const comparison = ACHIEVEMENT_COMPARISONS.includes(record['comparison'] as AchievementComparison)
    ? record['comparison'] as AchievementComparison
    : '=='
  return normaliseAchievement({
    id: text(record['id']) || newId('ach'),
    apiName: text(record['apiName']),
    name: text(record['name']),
    description: text(record['description']),
    variable: text(record['variable']),
    comparison,
    value: expected
  })
}

function normaliseAchievement(achievement: Achievement): Achievement {
  const value = achievement.value
  const comparison = typeof value === 'number' ? achievement.comparison
    : achievement.comparison === '!=' ? '!=' : '=='
  return {
    ...achievement,
    apiName: achievement.apiName.trim(),
    variable: achievement.variable.trim(),
    comparison
  }
}

export function parseAchievements(json: string): AchievementDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyAchievements()
    const entries = (parsed as Record<string, unknown>)['achievements']
    return {
      version: 1,
      achievements: Array.isArray(entries)
        ? entries.map(readAchievement).filter((one): one is Achievement => one !== null)
        : []
    }
  } catch {
    return emptyAchievements()
  }
}

export function serialiseAchievements(doc: AchievementDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
