import { describe, expect, it } from 'vitest'
import {
  achievementApiNameProblem,
  achievementMatches,
  emptyAchievements,
  parseAchievements,
  serialiseAchievements
} from './achievementDoc'

describe('achievement document', () => {
  it('matches typed comparisons without coercing unlike Ink values', () => {
    expect(achievementMatches(5, '>=', 5)).toBe(true)
    expect(achievementMatches(4, '>=', 5)).toBe(false)
    expect(achievementMatches(true, '==', true)).toBe(true)
    expect(achievementMatches('5', '==', 5)).toBe(false)
    expect(achievementMatches('trusted', '!=', 'hostile')).toBe(true)
  })

  it('tolerantly drops entries without a comparable value', () => {
    const doc = parseAchievements(JSON.stringify({ achievements: [
      { id: 'ach_0000000000', apiName: 'FIRST', name: 'First', variable: 'wins', comparison: '>=', value: 1 },
      { apiName: 'BROKEN', value: null }
    ] }))
    expect(doc.achievements).toHaveLength(1)
    expect(parseAchievements(serialiseAchievements(doc))).toEqual(doc)
  })

  it('requires unique Steam API names', () => {
    const doc = { ...emptyAchievements(), achievements: [{
      id: 'ach_0000000000', apiName: 'FIRST_WIN', name: 'First', description: '',
      variable: 'wins', comparison: '>=' as const, value: 1
    }] }
    expect(achievementApiNameProblem(doc, 'FIRST WIN')).toContain('underscores')
    expect(achievementApiNameProblem(doc, 'FIRST_WIN')).toContain('already used')
    expect(achievementApiNameProblem(doc, 'FIRST_WIN', 'ach_0000000000')).toBeNull()
  })
})
