import { describe, expect, it, vi } from 'vitest'
import { isIdOf } from './ids'
import {
  addItem,
  addStat,
  addVariable,
  emptyStats,
  inkName,
  nameProblem,
  newItem,
  newStat,
  newVariable,
  parseStats,
  removeItem,
  removeStat,
  serialiseStats,
  takenNames,
  updateStat,
  updateVariable,
  type StatsDocument
} from './statsDoc'

function seeded(): StatsDocument {
  let doc = emptyStats()
  doc = addStat(doc, newStat('Strength'))
  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addItem(doc, newItem('Shovel'))
  doc = addItem(doc, newItem('Rope'))
  doc = addItem(doc, newItem('Brass key'))
  return doc
}

describe('inkName', () => {
  it('makes an ink identifier out of free text', () => {
    expect(inkName('Brass Key')).toBe('brass_key')
    expect(inkName('  Shovel  ')).toBe('shovel')
    expect(inkName("Wren's ledger")).toBe('wren_s_ledger')
  })

  it('will not start an identifier with a digit, which ink refuses', () => {
    expect(inkName('9mm round')).toBe('_9mm_round')
  })

  it('reduces to nothing when there is nothing to use', () => {
    expect(inkName('!!!')).toBe('')
  })
})

describe('stats', () => {
  it('mints an id and a default suited to the kind', () => {
    expect(isIdOf(newStat('Strength').id, 'stt')).toBe(true)
    expect(newStat('Strength', 'number').initial).toBe(0)
    expect(newStat('Seen', 'boolean').initial).toBe(false)
    expect(newStat('Title', 'text').initial).toBe('')
  })

  it('keeps the initial value consistent when the kind changes', () => {
    // Otherwise a number stat turned boolean declares `VAR seen = 0`, which
    // compiles and then misbehaves at the first `{seen}`.
    const doc = addStat(emptyStats(), { ...newStat('Seen'), initial: 7 })
    const changed = updateStat(doc, doc.stats[0]!.id, { kind: 'boolean' })

    expect(changed.stats[0]!.initial).toBe(false)
  })

  it('removes one and leaves the rest', () => {
    const doc = seeded()
    const next = removeStat(doc, doc.stats[0]!.id)

    expect(next.stats.map((stat) => stat.name)).toEqual(['has_met_wren'])
    expect(next.items).toHaveLength(3)
  })
})

describe('hidden vars', () => {
  it('stores them separately from player-visible stats', () => {
    const doc = addVariable(emptyStats(), newVariable('Has met Wren', 'boolean'))

    expect(doc.stats).toEqual([])
    expect(doc.variables[0]).toMatchObject({ name: 'has_met_wren', initial: false })
  })

  it('loads an older catalogue with no variables array as an empty list', () => {
    expect(parseStats('{"stats":[]}').variables).toEqual([])
  })

  it('shares the declaration namespace with stats and items', () => {
    const doc = addVariable(emptyStats(), newVariable('Strength'))
    expect(nameProblem(doc, 'strength')).toContain('already used')
  })
})

describe('items', () => {
  it('keeps them in one flat list, in the order they were added', () => {
    expect(seeded().items.map((item) => item.name)).toEqual(['shovel', 'rope', 'brass_key'])
  })

  it('removes one and leaves the rest', () => {
    const doc = seeded()
    const next = removeItem(doc, doc.items[0]!.id)

    expect(next.items.map((item) => item.name)).toEqual(['rope', 'brass_key'])
  })
})

describe('nameProblem', () => {
  const doc = seeded()

  it('accepts a name nothing else has', () => {
    expect(nameProblem(doc, 'Lantern')).toBeNull()
  })

  it('refuses a name with nothing usable in it', () => {
    expect(nameProblem(doc, '???')).toMatch(/at least one letter/)
  })

  // Ink puts stats, items and list types in one namespace, so all three collide.
  it('refuses a name another stat or item already has', () => {
    expect(nameProblem(doc, 'Strength')).toMatch(/already used/)
    expect(nameProblem(doc, 'shovel')).toMatch(/already used/)
  })

  it('refuses the inventory variable’s own name', () => {
    expect(nameProblem(doc, 'inventory')).toMatch(/inventory variable/)
  })

  // The list every item is declared in shares ink's one namespace with them.
  it('refuses the name of the list items are declared in', () => {
    expect(nameProblem(doc, 'items')).toMatch(/list every item/)
  })

  it('lets an entry keep its own name while being edited', () => {
    expect(nameProblem(doc, 'Strength', doc.stats[0]!.id)).toBeNull()
  })
})

describe('renaming', () => {
  it('keeps the id, so nothing pointing at the entry is repointed', () => {
    const doc = seeded()
    const id = doc.stats[0]!.id
    const next = updateStat(doc, id, { name: 'might' })

    expect(next.stats[0]!.id).toBe(id)
    expect(next.stats[0]!.name).toBe('might')
  })

})

/**
 * The inventory variable is one fixed name rather than a setting, so the only
 * thing to check is that it stays out of everyone else's way.
 */
describe('the inventory variable', () => {
  it('is reserved against every other kind of name', () => {
    const doc = emptyStats()
    expect(nameProblem(doc, 'inventory')).toBe('inventory is the inventory variable.')
    expect(nameProblem(doc, 'Inventory')).toBe('inventory is the inventory variable.')
  })

  it('is taken, so nothing else can be given the name', () => {
    expect(takenNames(emptyStats()).has('inventory')).toBe(true)
  })
})

describe('presentation fields', () => {
  it('seeds the display name from what was typed', () => {
    // "Brass Key" is what a player should see; brass_key is not.
    const item = newItem('Brass Key')
    expect(item.name).toBe('brass_key')
    expect(item.display).toBe('Brass Key')
  })

  it('starts everything else empty', () => {
    expect(newStat('Strength')).toMatchObject({ blurb: '', icon: '', custom: [] })
  })
})

describe('parseStats', () => {
  it('round-trips a catalogue', () => {
    const doc = seeded()
    expect(parseStats(serialiseStats(doc))).toEqual(doc)
  })

  it('ends the file with a newline, like every other document here', () => {
    expect(serialiseStats(emptyStats()).endsWith('\n')).toBe(true)
  })

  it('yields an empty catalogue rather than throwing on nonsense', () => {
    expect(parseStats('not json at all')).toEqual(emptyStats())
    expect(parseStats('null')).toEqual(emptyStats())
    expect(parseStats('[]')).toEqual(emptyStats())
  })

  it('mints an id for an entry hand-written without one', () => {
    const doc = parseStats('{"stats":[{"name":"strength","kind":"number","initial":0}]}')
    expect(isIdOf(doc.stats[0]!.id, 'stt')).toBe(true)
  })

  it('drops an entry with no usable name rather than declaring a broken VAR', () => {
    const doc = parseStats('{"stats":[{"name":"!!!"},{"name":"strength"}]}')
    expect(doc.stats.map((stat) => stat.name)).toEqual(['strength'])
  })

  it('keeps an item that names no category, which no longer decides anything', () => {
    const doc = parseStats('{"items":[{"name":"shovel"},{"name":"rope"}]}')
    expect(doc.items.map((item) => item.name)).toEqual(['shovel', 'rope'])
  })

  /** The fields items used to be grouped by. */
  it('reads a file that still carries categories, dropping them', () => {
    const doc = parseStats(
      '{"categories":["Tools"],"items":[{"name":"rope","category":"Tools"},{"name":"brass_key","category":"Keys"}]}'
    )

    expect(doc.items.map((item) => item.name)).toEqual(['rope', 'brass_key'])
    expect(doc.items[0]).not.toHaveProperty('category')
    expect(doc).not.toHaveProperty('categories')
  })

  it('cleans a name that was hand-written in prose', () => {
    const doc = parseStats('{"stats":[{"name":"Brass Key"}]}')
    expect(doc.stats[0]!.name).toBe('brass_key')
  })

  /** The field the inventory name used to live in. */
  it('reads a file that still carries an inventoryName, ignoring it', () => {
    const doc = parseStats('{"inventoryName":"the_pack","stats":[{"name":"strength"}]}')

    expect(doc.stats[0]!.name).toBe('strength')
    expect(JSON.parse(serialiseStats(doc))).not.toHaveProperty('inventoryName')
  })

  it('round-trips every presentation field, including awkward custom labels', () => {
    let doc = addStat(emptyStats(), newStat('Strength'))
    doc = updateStat(doc, doc.stats[0]!.id, {
      display: 'Strength',
      blurb: 'How much they can lift.',
      icon: 'icons/str.png',
      custom: [
        { label: 'max', value: '10' },
        { label: 'a label with spaces', value: '' },
        { label: 'quote"inside', value: 'and \ a backslash' }
      ]
    })

    expect(parseStats(serialiseStats(doc))).toEqual(doc)
  })

  it('drops a custom pair with no label, which would export as nothing', () => {
    const doc = parseStats(
      '{"stats":[{"name":"strength","custom":[{"label":"  ","value":"x"},{"label":"ok","value":"y"}]}]}'
    )
    expect(doc.stats[0]!.custom).toEqual([{ label: 'ok', value: 'y' }])
  })
})

/**
 * The regression that matters: the seeded projects and anything the author has
 * already saved are on the previous shape, which had none of the presentation
 * fields.
 */
describe('a catalogue written before the presentation fields existed', () => {
  const OLD = JSON.stringify({
    version: 1,
    stats: [{ id: 'stt_0000000001', name: 'strength', kind: 'number', initial: 2, description: 'Lift.' }],
    items: [{ id: 'stt_0000000002', name: 'shovel', category: 'Tools', description: '' }],
    categories: ['Tools']
  })

  it('loads, with the new fields empty rather than being rejected', () => {
    const doc = parseStats(OLD)

    expect(doc.stats[0]).toMatchObject({
      name: 'strength',
      initial: 2,
      description: 'Lift.',
      display: '',
      blurb: '',
      icon: '',
      custom: []
    })
    expect(doc.items[0]).toMatchObject({ name: 'shovel', display: '' })
  })

  it('keeps the ids it was written with', () => {
    const doc = parseStats(OLD)
    expect(doc.stats[0]!.id).toBe('stt_0000000001')
    expect(doc.items[0]!.id).toBe('stt_0000000002')
  })
})

/**
 * The catalogues stamp their own entries, so a list of sixty can be read
 * newest first. The stamp is a fact about the entry, not about the file, so it
 * is set where the entry changes rather than where the document is written.
 */
describe('when an entry was last touched', () => {
  // The clock is held still and moved by hand: a create and an edit in the
  // same millisecond really do share a stamp, which is fine for reading a list
  // newest first and useless for asserting that one followed the other.
  it('stamps a new entry and each real edit of it', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
      const doc = addVariable(emptyStats(), newVariable('Courage'))
      const first = doc.variables[0]!
      expect(first.modified).toBe('2026-09-01T00:00:00.000Z')

      vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))
      const edited = updateVariable(doc, first.id, { description: 'How brave.' })
      expect(edited.variables[0]!.modified).toBe('2026-09-02T00:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the stamp where it is when an edit changes nothing', () => {
    const doc = addVariable(emptyStats(), newVariable('Courage'))
    const before = doc.variables[0]!

    expect(updateVariable(doc, before.id, { description: '' }).variables[0]).toBe(before)
  })

  // An older project has no stamps, and that is an answer rather than a zero.
  it('reads an entry written before stamps existed as never stamped', () => {
    const older = JSON.stringify({
      version: 1,
      stats: [],
      variables: [{ id: 'stt_1', name: 'courage', kind: 'number', initial: 0 }],
      items: []
    })

    expect(parseStats(older).variables[0]!.modified).toBeNull()
  })

  it('round-trips a stamp through the file', () => {
    const doc = addVariable(emptyStats(), newVariable('Courage'))

    expect(parseStats(serialiseStats(doc)).variables[0]!.modified).toBe(doc.variables[0]!.modified)
  })

  it('refuses a stamp that is not a date', () => {
    const odd = JSON.stringify({
      version: 1,
      stats: [],
      variables: [{ id: 'stt_1', name: 'courage', kind: 'number', initial: 0, modified: 'soon' }],
      items: []
    })

    expect(parseStats(odd).variables[0]!.modified).toBeNull()
  })
})
