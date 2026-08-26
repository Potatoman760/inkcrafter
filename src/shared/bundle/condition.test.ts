import { describe, expect, it } from 'vitest'
import {
  describe as describeCondition,
  evaluate,
  referencedPaths,
  type Condition,
  type ConditionHost
} from './condition'

/**
 * The three gates the game shipped with were TypeScript closures. Each has a
 * test here proving the data says the same thing, because that equivalence is
 * the whole justification for replacing them.
 */

const host: ConditionHost = {
  visits: (path) => (path === 'the_vision' ? 1 : 0),
  stat: (key) => (key === 'faith' ? 4 : 0),
  npcStat: (npc, key) => (npc === 'abeline' && key === 'affection' ? 6 : 0),
  npcStatus: (npc, key) => (npc === 'abeline' && key === 'status' ? 'married' : 'single'),
  npcFlag: (npc, key) => npc === 'abeline' && key === 'isPregnant'
}

// ctx.engine.visitCount('the_vision') > 0
const AFTER_VISION: Condition = {
  op: 'compare',
  left: { source: 'visits', path: 'the_vision' },
  cmp: '>',
  right: 0
}

// ctx.stats.get('faith') >= 4
const FAITHFUL: Condition = {
  op: 'compare',
  left: { source: 'stat', key: 'faith' },
  cmp: '>=',
  right: 4
}

// ctx.npcs.getStatus('abeline', 'status') === 'married'
const MARRIED: Condition = {
  op: 'compare',
  left: { source: 'npcStatus', npc: 'abeline', key: 'status' },
  cmp: '==',
  right: 'married'
}

describe('evaluate', () => {
  it('is open when there is no gate', () => {
    expect(evaluate(null, host)).toBe(true)
  })

  it('reproduces the three gates the closures expressed', () => {
    expect(evaluate(AFTER_VISION, host)).toBe(true)
    expect(evaluate(FAITHFUL, host)).toBe(true)
    expect(evaluate(MARRIED, host)).toBe(true)
  })

  it('closes when the gate is not met', () => {
    const unread: ConditionHost = { ...host, visits: () => 0 }
    expect(evaluate(AFTER_VISION, unread)).toBe(false)

    const faithless: ConditionHost = { ...host, stat: () => 3 }
    expect(evaluate(FAITHFUL, faithless)).toBe(false)

    const single: ConditionHost = { ...host, npcStatus: () => 'single' }
    expect(evaluate(MARRIED, single)).toBe(false)
  })

  it('joins gates with all, any and not', () => {
    expect(evaluate({ op: 'all', of: [AFTER_VISION, FAITHFUL] }, host)).toBe(true)
    expect(evaluate({ op: 'all', of: [AFTER_VISION, MARRIED] }, host)).toBe(true)
    expect(evaluate({ op: 'not', of: AFTER_VISION }, host)).toBe(false)

    const single: ConditionHost = { ...host, npcStatus: () => 'single' }
    expect(evaluate({ op: 'all', of: [AFTER_VISION, MARRIED] }, single)).toBe(false)
    expect(evaluate({ op: 'any', of: [AFTER_VISION, MARRIED] }, single)).toBe(true)
  })

  it('reads an empty all as open and an empty any as closed', () => {
    expect(evaluate({ op: 'all', of: [] }, host)).toBe(true)
    expect(evaluate({ op: 'any', of: [] }, host)).toBe(false)
  })

  it('reads a flag', () => {
    const pregnant: Condition = {
      op: 'compare',
      left: { source: 'npcFlag', npc: 'abeline', key: 'isPregnant' },
      cmp: '==',
      right: true
    }
    expect(evaluate(pregnant, host)).toBe(true)
  })

  // A stale gate should lock a door, not throw while a map is being drawn.
  it('is false rather than throwing when the comparison makes no sense', () => {
    const nonsense: Condition = {
      op: 'compare',
      left: { source: 'npcStatus', npc: 'abeline', key: 'status' },
      cmp: '>',
      right: 3
    }
    expect(evaluate(nonsense, host)).toBe(false)
  })

  it('locks rather than opens when a gate names something gone', () => {
    const missing: Condition = {
      op: 'compare',
      left: { source: 'stat', key: 'no_such_stat' },
      cmp: '>=',
      right: 1
    }
    expect(evaluate(missing, host)).toBe(false)
  })
})

describe('referencedPaths', () => {
  it('finds every knot a gate asks about, however deep', () => {
    const nested: Condition = {
      op: 'all',
      of: [AFTER_VISION, { op: 'not', of: { ...AFTER_VISION, left: { source: 'visits', path: 'ending' } } }]
    }

    expect(referencedPaths(nested).sort()).toEqual(['ending', 'the_vision'])
    expect(referencedPaths(FAITHFUL)).toEqual([])
    expect(referencedPaths(null)).toEqual([])
  })
})

describe('describe', () => {
  const labels = {
    stats: { faith: 'Faith' },
    npcs: { abeline: 'Sister Abeline' },
    attrs: { 'abeline.status': 'Status', 'abeline.isPregnant': 'expecting' }
  }

  it('says the common progression gate the way a person would', () => {
    expect(describeCondition(AFTER_VISION)).toBe('after the_vision')
  })

  it('uses display names rather than ink names', () => {
    expect(describeCondition(FAITHFUL, labels)).toBe('Faith is at least 4')
    expect(describeCondition(MARRIED, labels)).toBe("Sister Abeline's Status is married")
  })

  it('reads a flag as a statement', () => {
    const pregnant: Condition = {
      op: 'compare',
      left: { source: 'npcFlag', npc: 'abeline', key: 'isPregnant' },
      cmp: '==',
      right: true
    }
    expect(describeCondition(pregnant, labels)).toBe('Sister Abeline is expecting')
  })

  it('joins and says when there is no gate at all', () => {
    expect(describeCondition(null)).toBe('Always open')
    expect(describeCondition({ op: 'all', of: [AFTER_VISION, FAITHFUL] }, labels)).toBe(
      'after the_vision and Faith is at least 4'
    )
  })
})
