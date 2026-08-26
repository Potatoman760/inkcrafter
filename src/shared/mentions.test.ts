import { describe, expect, it } from 'vitest'
import { newEntry, type CodexEntry } from './codex'
import { findMentions, proseRanges } from './mentions'

/** The prose the scanner kept, with `|` marking the seams between ranges. */
function prose(source: string): string {
  return proseRanges(source)
    .map((range) => source.slice(range.from, range.to))
    .join('|')
}

/** Ids are normally generated; fixed here so assertions can name them. */
function entry(name: string, overrides: Partial<CodexEntry> = {}): CodexEntry {
  return { ...newEntry('lib_0000000000', name), id: name.toLowerCase(), ...overrides }
}

function names(source: string, entries: CodexEntry[]): string[] {
  return findMentions(source, entries).map((mention) => mention.text)
}

describe('proseRanges', () => {
  it('keeps plain story text', () => {
    expect(prose('The door is shut.')).toBe('The door is shut.')
  })

  it('drops line and block comments', () => {
    expect(prose('Hello // not this')).toBe('Hello ')
    expect(prose('Hello /* nope */ world')).toBe('Hello | world')
  })

  it('drops block comments spanning lines', () => {
    expect(prose('a\n/* one\ntwo */ b')).toBe('a|b')
  })

  it('drops declarations and logic lines', () => {
    expect(prose('VAR courage = 2')).toBe('')
    expect(prose('~ courage = courage + 1')).toBe('')
    expect(prose('INCLUDE characters.ink')).toBe('')
  })

  it('drops knot and stitch headers', () => {
    expect(prose('=== the_door ===')).toBe('')
    expect(prose('= inside')).toBe('')
  })

  it('drops divert targets but keeps surrounding prose', () => {
    expect(prose('She leaves. -> the_door')).toBe('She leaves. ')
  })

  it('drops tags', () => {
    expect(prose('Quiet here. #scene:corridor')).toBe('Quiet here. ')
  })

  it('keeps choice text but drops the bullet and label', () => {
    expect(prose('* (again) Try the handle')).toBe('Try the handle')
    expect(prose('+ [Knock] and wait')).toBe('[Knock] and wait')
  })

  it('drops a bare expression inside braces', () => {
    expect(prose('You have {courage} left.')).toBe('You have | left.')
    expect(prose('* {courage >= 2} [Knock]')).toBe(' [Knock]')
  })

  it('keeps conditional text but drops the condition', () => {
    expect(prose('{has_lantern: You raise it.|You wish you had one.}')).toBe(
      ' You raise it.|You wish you had one.'
    )
  })

  it('keeps alternatives', () => {
    expect(prose('{Wren nods.|Wren looks away.}')).toBe('Wren nods.|Wren looks away.')
  })

  it('handles multiline conditional blocks', () => {
    const source = ['{ has_lantern:', '    You raise the lantern.', '- else:', '    Dark.', '}'].join('\n')
    // Indentation is trimmed per line; the offsets into the source stay exact.
    expect(prose(source)).toBe('You raise the lantern.|Dark.')
  })
})

describe('findMentions', () => {
  const wren = entry('Wren', { aliases: ['The Archivist'] })

  it('finds the name in prose', () => {
    expect(names('Wren looks up.', [wren])).toEqual(['Wren'])
  })

  it('finds aliases', () => {
    expect(names('The Archivist looks up.', [wren])).toEqual(['The Archivist'])
  })

  it('prefers the longest matching term', () => {
    const calloway = entry('Wren', { aliases: ['Wren Calloway'] })
    expect(names('Wren Calloway looks up.', [calloway])).toEqual(['Wren Calloway'])
  })

  it('ignores matches inside divert targets, logic and comments', () => {
    expect(names('-> wren_route', [wren])).toEqual([])
    expect(names('~ wren = 1', [wren])).toEqual([])
    expect(names('// remember to rewrite Wren', [wren])).toEqual([])
    expect(names('{wren_trust > 0}', [wren])).toEqual([])
  })

  it('does not match inside longer words', () => {
    expect(names('The wrench slipped.', [wren])).toEqual([])
  })

  it('matches common plurals without an alias', () => {
    const goblin = entry('Goblin')
    expect(names('Two goblins waited.', [goblin])).toEqual(['goblins'])
  })

  it('is case insensitive by default', () => {
    expect(names('wren looks up.', [wren])).toEqual(['wren'])
  })

  it('honours case sensitivity', () => {
    const red = entry('Red', {
      tracking: { byName: true, caseSensitive: true, exclusions: [] }
    })
    expect(names('Red wore red.', [red])).toEqual(['Red'])
  })

  it('honours the exclusion list', () => {
    const will = entry('Will', {
      tracking: { byName: true, caseSensitive: false, exclusions: ['will be', 'will not'] }
    })
    expect(names('Will will be late, but Will will not mind.', [will])).toEqual(['Will', 'Will'])
  })

  it('skips entries with tracking switched off', () => {
    const untracked = entry('Wren', {
      tracking: { byName: false, caseSensitive: false, exclusions: [] }
    })
    expect(names('Wren looks up.', [untracked])).toEqual([])
  })

  it('reports offsets into the original source', () => {
    const source = 'She left. -> hall\nWren waited.'
    const [mention] = findMentions(source, [wren])
    expect(source.slice(mention!.from, mention!.to)).toBe('Wren')
    expect(mention!.entryId).toBe('wren')
  })
})
