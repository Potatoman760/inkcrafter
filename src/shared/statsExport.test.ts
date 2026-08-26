import { describe, expect, it } from 'vitest'
import { Compiler } from 'inkjs/compiler/Compiler'
import {
  addCategory,
  addItem,
  addStat,
  addVariable,
  emptyStats,
  newItem,
  newStat,
  newVariable,
  updateItem,
  updateStat,
  type StatsDocument
} from './statsDoc'
import { renderStateInk } from './statsInk'
import { buildExport, serialiseExport } from './statsExport'

function seeded(): StatsDocument {
  let doc = emptyStats()

  doc = addStat(doc, { ...newStat('Strength'), initial: 2 })
  doc = updateStat(doc, doc.stats[0]!.id, {
    display: 'Strength',
    blurb: 'How much they can lift.',
    icon: 'icons/str.png',
    custom: [{ label: 'max', value: '10' }]
  })

  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addStat(doc, { ...newStat('Title', 'text'), initial: 'archivist' })
  doc = addVariable(doc, { ...newVariable('Has opened vault', 'boolean'), initial: true })

  doc = addItem(doc, newItem('Shovel', 'Tools'))
  doc = addItem(doc, newItem('Brass key', 'Keys'))
  doc = updateItem(doc, doc.items[1]!.id, {
    display: 'Brass Key',
    blurb: 'Cold, heavy, older than the door.',
    icon: 'icons/key.png',
    custom: [{ label: 'slot', value: 'offhand' }]
  })

  return doc
}

describe('buildExport', () => {
  it('translates kinds into names an engine expects', () => {
    const types = buildExport(seeded()).stats.map((stat) => stat.type)
    expect(types).toEqual(['int', 'bool', 'string'])
  })

  it('carries the metadata that never reaches the ink', () => {
    const key = buildExport(seeded()).items.find((item) => item.name === 'brass_key')!

    expect(key.display).toBe('Brass Key')
    expect(key.blurb).toBe('Cold, heavy, older than the door.')
    expect(key.icon).toBe('icons/key.png')
    expect(key.custom).toEqual({ slot: 'offhand' })
  })

  it('carries each stat’s starting value under a name an engine will look for', () => {
    const strength = buildExport(seeded()).stats[0]!
    expect(strength).toMatchObject({ name: 'strength', type: 'int', default: 2 })
  })

  it('exports hidden vars separately without player-facing presentation', () => {
    expect(buildExport(seeded()).variables).toEqual([
      {
        name: 'has_opened_vault',
        type: 'bool',
        default: true,
        min: null,
        max: null
      }
    ])
    expect(buildExport(seeded()).stats.map((stat) => stat.name)).not.toContain('has_opened_vault')
    expect(renderStateInk(seeded())).toContain('VAR has_opened_vault = true')
  })

  it('names the inventory variable, which is what the game reads', () => {
    expect(buildExport(seeded()).inventoryVariable).toBe('inventory')
  })

  // The array is the right shape for editing; the object is the right shape for
  // reading, and the conversion happens once, here.
  it('turns custom pairs into an object, dropping blank labels', () => {
    const doc = seeded()
    const next = updateStat(doc, doc.stats[0]!.id, {
      custom: [
        { label: 'a', value: '1' },
        { label: '   ', value: 'lost' },
        { label: 'b', value: '2' }
      ]
    })

    expect(buildExport(next).stats[0]!.custom).toEqual({ a: '1', b: '2' })
  })

  it('lets a later pair win a duplicated label, as an object literal would', () => {
    const doc = seeded()
    const next = updateStat(doc, doc.stats[0]!.id, {
      custom: [
        { label: 'slot', value: 'first' },
        { label: 'slot', value: 'second' }
      ]
    })

    expect(buildExport(next).stats[0]!.custom).toEqual({ slot: 'second' })
  })

  // An empty category generates no LIST, so exporting it would name a list the
  // story does not have — the same rule renderStateInk follows.
  it('skips a category with nothing in it', () => {
    const doc = addCategory(seeded(), 'Unused')
    const exported = buildExport(doc)

    expect(exported.categories.map((category) => category.name)).toEqual(['Tools', 'Keys'])
    expect(exported.items.every((item) => item.category !== 'Unused')).toBe(true)
  })

  it('exports an empty catalogue without inventing anything', () => {
    const exported = buildExport(emptyStats())
    expect(exported.stats).toEqual([])
    expect(exported.variables).toEqual([])
    expect(exported.items).toEqual([])
    expect(exported.categories).toEqual([])
  })

  it('ends the file with a newline, like every other document here', () => {
    expect(serialiseExport(buildExport(seeded())).endsWith('\n')).toBe(true)
  })
})

/**
 * The export's whole claim is that it lines up with the compiled story. An
 * engine reads `listDefs` out of the story JSON and the metadata out of here,
 * and joins them by list and item name — so the join is tested rather than
 * asserted.
 */
describe('the join to the compiled story', () => {
  function listDefs(doc: StatsDocument): Record<string, Record<string, number>> {
    const source = `${renderStateInk(doc)}\n-> s\n=== s ===\nx\n-> END\n`
    const json = JSON.parse(new Compiler(source).Compile().ToJson()!) as {
      listDefs?: Record<string, Record<string, number>>
    }
    return json.listDefs ?? {}
  }

  it('names a list for every exported category, and the story declares it', () => {
    const doc = seeded()
    const defs = listDefs(doc)

    for (const category of buildExport(doc).categories) {
      expect(Object.keys(defs)).toContain(category.list)
    }
  })

  it('gives every exported item a list that actually contains it', () => {
    const doc = seeded()
    const defs = listDefs(doc)

    for (const item of buildExport(doc).items) {
      expect(defs[item.list], `${item.list} missing from listDefs`).toBeDefined()
      expect(Object.keys(defs[item.list]!)).toContain(item.name)
    }
  })

  it('holds up when a category name is not a legal ink identifier', () => {
    // "Key items" becomes the list `Key_items`, and the export has to say so
    // rather than repeating the human-facing name.
    let doc = emptyStats()
    doc = addItem(doc, newItem('Brass key', 'Key items'))

    const exported = buildExport(doc)
    expect(exported.categories[0]).toEqual({ name: 'Key items', list: 'Key_items' })
    expect(Object.keys(listDefs(doc))).toContain('Key_items')
    expect(Object.keys(listDefs(doc)['Key_items']!)).toContain('brass_key')
  })

  it('exports every item the story declares, and no others', () => {
    const doc = seeded()
    const declared = Object.values(listDefs(doc)).flatMap((members) => Object.keys(members))

    expect(buildExport(doc).items.map((item) => item.name).sort()).toEqual(declared.sort())
  })
})
