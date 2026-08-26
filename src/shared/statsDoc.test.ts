import { describe, expect, it } from 'vitest'
import { isIdOf } from './ids'
import {
  addCategory,
  addItem,
  addStat,
  addVariable,
  categoryProblem,
  emptyStats,
  inkName,
  itemsInCategory,
  moveCategory,
  moveItem,
  moveStat,
  nameProblem,
  newItem,
  newStat,
  newVariable,
  parseStats,
  removeCategory,
  removeItem,
  removeStat,
  renameCategory,
  serialiseStats,
  takenNames,
  updateItem,
  updateStat,
  type StatsDocument
} from './statsDoc'

function seeded(): StatsDocument {
  let doc = emptyStats()
  doc = addStat(doc, newStat('Strength'))
  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addItem(doc, newItem('Shovel', 'Tools'))
  doc = addItem(doc, newItem('Rope', 'Tools'))
  doc = addItem(doc, newItem('Brass key', 'Keys'))
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

describe('items and categories', () => {
  it('records a category the first time an item uses it', () => {
    expect(seeded().categories).toEqual(['Tools', 'Keys'])
  })

  it('does not record the same category twice', () => {
    const doc = addItem(seeded(), newItem('Lantern', 'Tools'))
    expect(doc.categories).toEqual(['Tools', 'Keys'])
  })

  it('records a category added on its own, before it has items', () => {
    expect(addCategory(emptyStats(), 'Documents').categories).toEqual(['Documents'])
  })

  it('records a category an item is moved into', () => {
    const doc = seeded()
    const next = updateItem(doc, doc.items[0]!.id, { category: 'Curios' })

    expect(next.categories).toContain('Curios')
    expect(itemsInCategory(next, 'Curios').map((item) => item.name)).toEqual(['shovel'])
  })

  // Emptying it instead would leave items in a category that generates no LIST,
  // and every use of them would fail to compile.
  it('takes a category’s items with it when removed', () => {
    const next = removeCategory(seeded(), 'Tools')

    expect(next.categories).toEqual(['Keys'])
    expect(next.items.map((item) => item.name)).toEqual(['brass_key'])
  })

  it('removes one item and leaves its category', () => {
    const doc = seeded()
    const next = removeItem(doc, doc.items[0]!.id)

    expect(next.items.map((item) => item.name)).toEqual(['rope', 'brass_key'])
    expect(next.categories).toEqual(['Tools', 'Keys'])
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

  it('refuses a name that collides with a category', () => {
    expect(nameProblem(doc, 'Tools')).toMatch(/already a category/)
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

  it('carries a category’s items with it', () => {
    // Left behind, they would be in a category that generates no LIST — the
    // same broken state removeCategory avoids by taking its items along.
    const next = renameCategory(seeded(), 'Tools', 'Equipment')

    expect(next.categories).toEqual(['Equipment', 'Keys'])
    expect(itemsInCategory(next, 'Equipment').map((item) => item.name)).toEqual(['shovel', 'rope'])
    expect(itemsInCategory(next, 'Tools')).toEqual([])
  })

  it('refuses a category rename onto one that exists', () => {
    const doc = seeded()
    expect(renameCategory(doc, 'Tools', 'Keys')).toBe(doc)
  })

  it('refuses a category rename to nothing', () => {
    const doc = seeded()
    expect(renameCategory(doc, 'Tools', '   ')).toBe(doc)
  })
})

describe('categoryProblem', () => {
  const doc = seeded()

  it('accepts a name nothing else claims', () => {
    expect(categoryProblem(doc, 'Documents')).toBeNull()
  })

  it('refuses one that already exists', () => {
    expect(categoryProblem(doc, 'Tools')).toMatch(/already a Tools/)
  })

  // The hole this closes: nameProblem guarded a stat colliding with a category,
  // but nothing guarded the other direction, and the result was ink that would
  // not compile.
  it('refuses one colliding with a stat or an item', () => {
    expect(categoryProblem(doc, 'Strength')).toMatch(/collides with/)
    expect(categoryProblem(doc, 'Shovel')).toMatch(/collides with/)
  })

  it('refuses one colliding with the inventory variable', () => {
    expect(categoryProblem(doc, 'Inventory')).toMatch(/inventory variable/)
  })

  it('lets a category keep its own name while being renamed', () => {
    expect(categoryProblem(doc, 'Tools', 'Tools')).toBeNull()
  })
})

describe('reordering', () => {
  it('moves a stat up and down', () => {
    const doc = seeded()
    const names = (next: StatsDocument): string[] => next.stats.map((stat) => stat.name)

    expect(names(moveStat(doc, doc.stats[1]!.id, -1))).toEqual(['has_met_wren', 'strength'])
    expect(names(moveStat(doc, doc.stats[0]!.id, 1))).toEqual(['has_met_wren', 'strength'])
  })

  it('refuses to move past either end', () => {
    const doc = seeded()
    expect(moveStat(doc, doc.stats[0]!.id, -1)).toBe(doc)
    expect(moveStat(doc, doc.stats.at(-1)!.id, 1)).toBe(doc)
  })

  // Items are ordered within their category, which is the order the author
  // sees; moving one must not disturb another category's places.
  it('moves an item within its category, leaving other categories alone', () => {
    const doc = addItem(seeded(), newItem('Lantern', 'Tools'))
    const rope = doc.items.find((item) => item.name === 'rope')!
    const next = moveItem(doc, rope.id, 1)

    expect(itemsInCategory(next, 'Tools').map((item) => item.name)).toEqual([
      'shovel',
      'lantern',
      'rope'
    ])
    expect(itemsInCategory(next, 'Keys').map((item) => item.name)).toEqual(['brass_key'])
  })

  it('refuses to move an item past the end of its own category', () => {
    const doc = seeded()
    const key = doc.items.find((item) => item.name === 'brass_key')!
    expect(moveItem(doc, key.id, 1)).toBe(doc)
  })

  it('moves a category', () => {
    expect(moveCategory(seeded(), 'Keys', -1).categories).toEqual(['Keys', 'Tools'])
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
    expect(categoryProblem(doc, 'Inventory')).toBe('Inventory is the inventory variable.')
  })

  it('is taken, so nothing else can be given the name', () => {
    expect(takenNames(emptyStats()).has('inventory')).toBe(true)
  })
})

describe('presentation fields', () => {
  it('seeds the display name from what was typed', () => {
    // "Brass Key" is what a player should see; brass_key is not.
    const item = newItem('Brass Key', 'Keys')
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

  it('drops an item naming no category, since the category decides its LIST', () => {
    const doc = parseStats('{"items":[{"name":"shovel"},{"name":"rope","category":"Tools"}]}')
    expect(doc.items.map((item) => item.name)).toEqual(['rope'])
  })

  // A hand-edited file can list an item whose category the array forgot; that
  // category still has to generate, or the item declares nothing.
  it('recovers a category an item claims but the list omits', () => {
    const doc = parseStats(
      '{"categories":["Tools"],"items":[{"name":"rope","category":"Tools"},{"name":"brass_key","category":"Keys"}]}'
    )
    expect(doc.categories).toEqual(['Tools', 'Keys'])
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
    expect(doc.items[0]).toMatchObject({ name: 'shovel', category: 'Tools', display: '' })
  })

  it('keeps the ids it was written with', () => {
    const doc = parseStats(OLD)
    expect(doc.stats[0]!.id).toBe('stt_0000000001')
    expect(doc.items[0]!.id).toBe('stt_0000000002')
  })
})
