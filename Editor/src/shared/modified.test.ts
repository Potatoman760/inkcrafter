import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agoLabel, DEFAULT_SORT, restamp, sortBy, stampNow } from './modified'

/**
 * When an entry was touched, and the orders a long list can be read in.
 *
 * The thing worth more than the sorting itself is that a stamp does not move
 * when nothing actually changed: a wrong date is worse than no date. After
 * that, the case that decides whether reversing is trustworthy — an entry
 * nobody has ever stamped, which is not the oldest but the one with no answer.
 */

const entry = (name: string, modified: string | null): { name: string; modified: string | null } => ({
  name,
  modified
})

const read = {
  label: (one: { name: string }) => one.name,
  modified: (one: { modified: string | null }) => one.modified
}

describe('sortBy', () => {
  const list = [
    entry('zebra', '2026-01-01T00:00:00.000Z'),
    entry('chapter10_day', null),
    entry('apple', '2026-06-01T00:00:00.000Z'),
    entry('chapter2_day', '2026-03-01T00:00:00.000Z')
  ]

  it('sorts by name by default, counting the numbers in one', () => {
    expect(sortBy(list, DEFAULT_SORT, read).map((one) => one.name)).toEqual([
      'apple',
      'chapter2_day',
      'chapter10_day',
      'zebra'
    ])
  })

  it('reverses a name sort', () => {
    expect(sortBy(list, { by: 'name', reversed: true }, read).map((one) => one.name)).toEqual([
      'zebra',
      'chapter10_day',
      'chapter2_day',
      'apple'
    ])
  })

  it('sorts newest first, and puts the never-stamped last', () => {
    expect(sortBy(list, { by: 'modified', reversed: false }, read).map((one) => one.name)).toEqual([
      'apple',
      'chapter2_day',
      'zebra',
      'chapter10_day'
    ])
  })

  // Reversed means oldest first, not "everything backwards": an entry nobody
  // has stamped has no date to be oldest by, and promoting it to the top would
  // put the absences where the answer should be.
  it('reverses into oldest first, and still leaves the never-stamped last', () => {
    expect(sortBy(list, { by: 'modified', reversed: true }, read).map((one) => one.name)).toEqual([
      'zebra',
      'chapter2_day',
      'apple',
      'chapter10_day'
    ])
  })

  it('leaves the list it was given alone', () => {
    const before = list.map((one) => one.name)
    sortBy(list, { by: 'name', reversed: true }, read)
    sortBy(list, { by: 'modified', reversed: true }, read)
    expect(list.map((one) => one.name)).toEqual(before)
  })
})

describe('restamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves the stamp when something changed', () => {
    const before = { name: 'courage', description: 'old', modified: '2020-01-01T00:00:00.000Z' }

    expect(restamp(before, { ...before, description: 'new' })).toEqual({
      name: 'courage',
      description: 'new',
      modified: '2026-09-06T12:00:00.000Z'
    })
  })

  // A panel calls its update function on every keystroke, and some call it with
  // what is already there. A date that moved on a day nobody opened the file is
  // a wrong answer, which is worse than a missing one.
  it('leaves the entry alone when nothing changed', () => {
    const before = { name: 'courage', description: 'same', modified: '2020-01-01T00:00:00.000Z' }

    expect(restamp(before, { ...before })).toBe(before)
  })

  it('stamps an entry that had never been stamped', () => {
    const before = { name: 'courage', description: 'old', modified: null }

    expect(restamp(before, { ...before, description: 'new' }).modified).toBe(
      '2026-09-06T12:00:00.000Z'
    )
  })

  it('writes an instant that sorts as a string', () => {
    expect(stampNow()).toBe('2026-09-06T12:00:00.000Z')
  })
})

describe('agoLabel', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z')

  it('says how long ago in the words a row has room for', () => {
    expect(agoLabel('2026-09-06T11:59:30.000Z', now)).toBe('just now')
    expect(agoLabel('2026-09-06T11:30:00.000Z', now)).toBe('30m ago')
    expect(agoLabel('2026-09-06T05:00:00.000Z', now)).toBe('7h ago')
    expect(agoLabel('2026-09-01T12:00:00.000Z', now)).toBe('5d ago')
  })

  it('says nothing at all for an entry that was never stamped', () => {
    expect(agoLabel(null, now)).toBe('')
    expect(agoLabel('not a date', now)).toBe('')
  })
})
