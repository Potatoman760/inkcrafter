import { describe, expect, it } from 'vitest'
import { newEntry, type CodexEntry } from '@shared/codex'
import { selectCodexEntries } from '@shared/codexContext'
import { renderCodexContext } from './context'

function entry(name: string, overrides: Partial<CodexEntry> = {}): CodexEntry {
  return {
    ...newEntry('lib_0000000000', name, 'character', name.toLowerCase()),
    id: `cdx_${name.toLowerCase()}`,
    description: `${name} exists.`,
    ...overrides
  }
}

const wren = entry('Wren', { aliases: ['The Archivist'] })
const archive = entry('The Archive', { type: 'location', description: 'Shelves and cold air.' })
const unrelated = entry('Barnaby')

const names = (text: string, all: CodexEntry[]): string[] =>
  selectCodexEntries(text, all).entries.map((selected) => selected.name)

describe('selectCodexEntries', () => {
  it('includes an entry named in the text', () => {
    expect(names('Wren does not look up.', [wren, unrelated])).toEqual(['Wren'])
  })

  it('includes one named by an alias', () => {
    expect(names('The Archivist does not look up.', [wren, unrelated])).toEqual(['Wren'])
  })

  it('leaves out entries nothing mentions', () => {
    expect(names('An empty corridor.', [wren, unrelated])).toEqual([])
  })

  it('scans the whole prompt, not only the instruction', () => {
    // A character named in the scene but absent from the instruction is exactly
    // the case that makes this worth doing.
    const story = 'Wren does not look up from the ledger.'
    const instruction = 'Make her colder.'
    expect(names([story, instruction].join('\n\n'), [wren, unrelated])).toEqual(['Wren'])
  })

  it('always includes an entry set to always, named or not', () => {
    const rules = entry('House rules', { type: 'lore', aiContext: 'always' })
    expect(names('An empty corridor.', [wren, rules])).toEqual(['House rules'])
  })

  it('includes an always entry even when it is not tracked by name', () => {
    const rules = entry('House rules', {
      type: 'lore',
      aiContext: 'always',
      tracking: { byName: false, caseSensitive: false, exclusions: [] }
    })
    expect(names('An empty corridor.', [rules])).toEqual(['House rules'])
  })

  it('never includes an entry set to never, however loudly it is named', () => {
    const secret = entry('Wren', { aiContext: 'never' })
    expect(names('Wren. Wren. Wren.', [secret])).toEqual([])
  })

  it('pulls in a related entry alongside the one that was named', () => {
    const linked = { ...wren, relations: [archive.id] }
    expect(names('Wren does not look up.', [linked, archive]).sort()).toEqual([
      'The Archive',
      'Wren'
    ])
  })

  it('follows relations one hop only, so a codex does not arrive whole', () => {
    const a = entry('A', { relations: ['cdx_b'] })
    const b = entry('B', { relations: ['cdx_c'] })
    const c = entry('C')
    expect(names('A appears.', [a, b, c]).sort()).toEqual(['A', 'B'])
  })

  it('will not let a relation smuggle in an entry set to never', () => {
    const secret = entry('The Archive', { aiContext: 'never' })
    const linked = { ...wren, relations: [secret.id] }
    expect(names('Wren does not look up.', [linked, secret])).toEqual(['Wren'])
  })

  it('honours an exclusion list', () => {
    const will = entry('Will', {
      tracking: { byName: true, caseSensitive: false, exclusions: ['will be'] }
    })
    expect(names('It will be dark.', [will])).toEqual([])
    expect(names('Will opened the door.', [will])).toEqual(['Will'])
  })

  it('selects an entry once when it is both always and named', () => {
    const both = entry('Wren', { aiContext: 'always' })
    expect(names('Wren. Wren again.', [both])).toEqual(['Wren'])
  })

  it('selects an entry once when it is named and also related to a named entry', () => {
    const linked = { ...wren, relations: [archive.id] }
    const selection = selectCodexEntries('Wren waits in The Archive.', [linked, archive])
    expect(selection.entries.map((selected) => selected.id)).toEqual([archive.id, linked.id])
  })

  it('collapses repeated mentions of the same entry', () => {
    const selection = selectCodexEntries('Wren, Wren, The Archivist, Wren.', [wren])
    expect(selection.entries).toHaveLength(1)
    expect([...selection.detected]).toHaveLength(1)
  })

  it('reports which entries were named rather than inferred', () => {
    const linked = { ...wren, relations: [archive.id] }
    const selection = selectCodexEntries('Wren does not look up.', [linked, archive])
    expect([...selection.detected]).toEqual([linked.id])
  })
})

describe('renderCodexContext', () => {
  it('renders nothing when nothing was selected', () => {
    expect(renderCodexContext(selectCodexEntries('Nothing here.', [wren]))).toBe('')
  })

  it('states the codex is authoritative', () => {
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [wren]))
    expect(text).toMatch(/authoritative/)
    expect(text).toMatch(/do not contradict/i)
  })

  it('includes the name, type, aliases and description', () => {
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [wren]))
    expect(text).toContain('## Wren — character')
    expect(text).toContain('Also known as: The Archivist')
    expect(text).toContain('Wren exists.')
  })

  it('includes a character appearance as explicit image context', () => {
    const visible = { ...wren, appearance: 'Short silver hair, amber eyes, a weathered blue coat.' }
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [visible]))
    expect(text).toContain(
      'Appearance: Short silver hair, amber eyes, a weathered blue coat.'
    )
  })

  it('does not treat appearance as a field on non-character entries', () => {
    const place = { ...archive, appearance: 'An accidental legacy value.' }
    const text = renderCodexContext(selectCodexEntries('The Archive waits.', [place]))
    expect(text).not.toContain('Appearance:')
  })

  it('never includes private notes', () => {
    const withNotes = { ...wren, notes: 'Maybe make her the villain.' }
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [withNotes]))
    expect(text).not.toContain('villain')
  })

  it('includes details marked always', () => {
    const withDetail = {
      ...wren,
      details: [{ label: 'Voice', value: 'Dry and unhurried.', ai: 'always' as const }]
    }
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [withDetail]))
    expect(text).toContain('Voice: Dry and unhurried.')
  })

  it('omits details marked never', () => {
    const withDetail = {
      ...wren,
      details: [{ label: 'Secret', value: 'Burned the ledger.', ai: 'never' as const }]
    }
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [withDetail]))
    expect(text).not.toContain('Burned the ledger.')
  })

  it('shows a detected-only detail when named, and hides it when merely related', () => {
    const detail = { label: 'Manner', value: 'Never repeats herself.', ai: 'detected' as const }
    const subject = { ...wren, details: [detail] }
    const opener = { ...archive, relations: [subject.id] }

    const named = renderCodexContext(selectCodexEntries('Wren waits.', [subject, opener]))
    expect(named).toContain('Never repeats herself.')

    // Reached only through The Archive's relation, so the specifics stay out.
    const viaRelation = renderCodexContext(
      selectCodexEntries('The Archive is cold.', [subject, opener])
    )
    expect(viaRelation).toContain('## Wren')
    expect(viaRelation).not.toContain('Never repeats herself.')
  })

  it('names the library when two entries share a name, so they are distinguishable', () => {
    // Ids are unique, but two libraries can each hold a Wren; without this they
    // arrive as two identical, contradicting headings.
    const other = entry('Wren', { id: 'cdx_wren2', libraryId: 'lib_1111111111' })
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [wren, other]), {
      lib_0000000000: 'Archive world',
      lib_1111111111: 'Second game'
    })

    expect(text).toContain('## Wren (Archive world) — character')
    expect(text).toContain('## Wren (Second game) — character')
  })

  it('does not qualify a name that only one entry uses', () => {
    const text = renderCodexContext(selectCodexEntries('Wren waits.', [wren]), {
      lib_0000000000: 'Archive world'
    })
    expect(text).toContain('## Wren — character')
    expect(text).not.toContain('Archive world')
  })

  it('caps a large codex rather than crowding out the story', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      entry(`Person${index}`, { aiContext: 'always', description: 'x'.repeat(200) })
    )
    const text = renderCodexContext(selectCodexEntries('', many))
    expect(text.length).toBeLessThan(7_000)
    expect(text).toContain('## Person0')
  })
})
