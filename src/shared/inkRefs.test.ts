import { describe, expect, it } from 'vitest'
import {
  includesIn,
  orderIncludes,
  relativeInclude,
  resolveInclude,
  rewriteIncludes
} from './inkRefs'

/**
 * Relative paths, in both directions.
 *
 * The awkward part of moving an ink file: the same file is `chapter1.ink` to
 * one includer and `../chapter1.ink` to another, so a rename cannot be a search
 * and replace. These go over the conversions in both directions and over the
 * round trip, because a rename does resolve-then-relativise and an error in
 * either half moves the wrong file.
 */

describe('resolveInclude', () => {
  it('reads a sibling as a sibling', () => {
    expect(resolveInclude('ink/main.ink', 'chapter1.ink')).toBe('ink/chapter1.ink')
  })

  it('reads a path one folder down', () => {
    expect(resolveInclude('ink/main.ink', 'act-one/opening.ink')).toBe('ink/act-one/opening.ink')
  })

  it('climbs with ..', () => {
    expect(resolveInclude('ink/act-one/opening.ink', '../shared.ink')).toBe('ink/shared.ink')
    expect(resolveInclude('ink/act-one/opening.ink', '../../top.ink')).toBe('top.ink')
  })

  it('ignores . and empty segments', () => {
    expect(resolveInclude('ink/main.ink', './chapter1.ink')).toBe('ink/chapter1.ink')
  })

  it('reads a file at the root of the project', () => {
    expect(resolveInclude('main.ink', 'chapter1.ink')).toBe('chapter1.ink')
  })
})

describe('relativeInclude', () => {
  it('writes a sibling bare, the way ink files are actually written', () => {
    expect(relativeInclude('ink/main.ink', 'ink/chapter1.ink')).toBe('chapter1.ink')
  })

  it('writes a path one folder down', () => {
    expect(relativeInclude('ink/main.ink', 'ink/act-one/opening.ink')).toBe('act-one/opening.ink')
  })

  it('climbs when it has to', () => {
    expect(relativeInclude('ink/act-one/opening.ink', 'ink/shared.ink')).toBe('../shared.ink')
    expect(relativeInclude('ink/act-one/opening.ink', 'top.ink')).toBe('../../top.ink')
  })

  it('round-trips whatever resolveInclude read', () => {
    const cases: [string, string][] = [
      ['ink/main.ink', 'ink/chapter1.ink'],
      ['ink/main.ink', 'ink/act-one/opening.ink'],
      ['ink/act-one/opening.ink', 'ink/shared.ink'],
      ['ink/act-one/opening.ink', 'top.ink'],
      ['main.ink', 'chapter1.ink']
    ]

    for (const [from, target] of cases) {
      expect(resolveInclude(from, relativeInclude(from, target))).toBe(target)
    }
  })
})

describe('includesIn', () => {
  const SOURCE = [
    '// The story starts here.',
    '',
    'INCLUDE state.ink',
    'INCLUDE chapter1.ink',
    '   INCLUDE act-one/opening.ink',
    '',
    '-> chapter1'
  ].join('\n')

  it('finds every include, with where it is and what it means', () => {
    expect(includesIn('ink/main.ink', SOURCE)).toEqual([
      { line: 2, written: 'state.ink', target: 'ink/state.ink' },
      { line: 3, written: 'chapter1.ink', target: 'ink/chapter1.ink' },
      { line: 4, written: 'act-one/opening.ink', target: 'ink/act-one/opening.ink' }
    ])
  })

  it('does not mistake prose for structure', () => {
    const prose = 'She said INCLUDE was a strange word.\n-> END'
    expect(includesIn('ink/main.ink', prose)).toEqual([])
  })
})

describe('rewriteIncludes', () => {
  const SOURCE = 'INCLUDE state.ink\nINCLUDE chapter1.ink\n\n-> chapter1'

  it('rewrites the one that matched and leaves the rest alone', () => {
    const next = rewriteIncludes('ink/main.ink', SOURCE, 'ink/chapter1.ink', 'ink/act-one/opening.ink')

    expect(next).toBe('INCLUDE state.ink\nINCLUDE act-one/opening.ink\n\n-> chapter1')
  })

  it('says nothing changed rather than rewriting a file byte for byte', () => {
    // A caller that wrote every file would touch every timestamp, and a diff of
    // the project would show work that was not done.
    expect(rewriteIncludes('ink/main.ink', SOURCE, 'ink/nowhere.ink', 'ink/else.ink')).toBeNull()
  })

  it('writes the path as the including file has to see it', () => {
    const deep = 'INCLUDE ../chapter1.ink\n-> END'
    const next = rewriteIncludes('ink/act-one/opening.ink', deep, 'ink/chapter1.ink', 'ink/two.ink')

    expect(next).toBe('INCLUDE ../two.ink\n-> END')
  })

  it('keeps the indentation and spacing it found', () => {
    const spaced = '\tINCLUDE   chapter1.ink   '
    const next = rewriteIncludes('ink/main.ink', spaced, 'ink/chapter1.ink', 'ink/two.ink')

    expect(next).toBe('\tINCLUDE   two.ink   ')
  })

  it('follows a file that moved up out of its folder', () => {
    const source = 'INCLUDE act-one/opening.ink\n-> END'
    const next = rewriteIncludes('ink/main.ink', source, 'ink/act-one/opening.ink', 'ink/opening.ink')

    expect(next).toBe('INCLUDE opening.ink\n-> END')
  })
})

/**
 * The entry point should read the way the outline does.
 *
 * Scene files arrive grouped a chapter at a time and in reading order; anything
 * else the story includes has no place in that order, so it is kept as written
 * and follows at the end.
 */
describe('orderIncludes', () => {
  const ENTRY = 'ink/main.ink'
  const CHAPTERS = [
    ['arrival/at-the-gate.ink', 'arrival/the-hall.ink'],
    ['departure/the-road.ink']
  ]

  function lines(...text: string[]): string {
    return `${text.join('\n')}\n`
  }

  it('lists the story in reading order, a blank line between chapters', () => {
    const source = lines(
      'INCLUDE ../departure/the-road.ink',
      'INCLUDE ../arrival/the-hall.ink',
      '',
      '-> at_the_gate'
    )

    expect(orderIncludes(ENTRY, source, CHAPTERS)).toBe(
      lines(
        'INCLUDE ../arrival/at-the-gate.ink',
        'INCLUDE ../arrival/the-hall.ink',
        '',
        'INCLUDE ../departure/the-road.ink',
        '',
        '-> at_the_gate'
      )
    )
  })

  it('keeps what the plan does not own, at the end and as it was written', () => {
    const source = lines('INCLUDE state.ink', 'INCLUDE ../maps/world.ink', '', '-> at_the_gate')

    expect(orderIncludes(ENTRY, source, [['arrival/at-the-gate.ink']])).toBe(
      lines(
        'INCLUDE ../arrival/at-the-gate.ink',
        '',
        'INCLUDE state.ink',
        'INCLUDE ../maps/world.ink',
        '',
        '-> at_the_gate'
      )
    )
  })

  it('declares a new Scene in its place rather than on top of the file', () => {
    const source = lines(
      'INCLUDE ../arrival/at-the-gate.ink',
      'INCLUDE ../departure/the-road.ink',
      '',
      '-> at_the_gate'
    )

    // The hall joined chapter one after the road was written. It belongs
    // between the two, which is the whole point of reordering rather than
    // prepending what is missing.
    expect(orderIncludes(ENTRY, source, CHAPTERS)?.split('\n').slice(0, 4)).toEqual([
      'INCLUDE ../arrival/at-the-gate.ink',
      'INCLUDE ../arrival/the-hall.ink',
      '',
      'INCLUDE ../departure/the-road.ink'
    ])
  })

  it('sits above the first line that does anything, under a leading comment', () => {
    const source = lines('// The Gate', '', '-> at_the_gate', '', '=== start ===', '-> END')

    expect(orderIncludes(ENTRY, source, [['arrival/at-the-gate.ink']])).toBe(
      lines(
        '// The Gate',
        '',
        'INCLUDE ../arrival/at-the-gate.ink',
        '',
        '-> at_the_gate',
        '',
        '=== start ===',
        '-> END'
      )
    )
  })

  it('does not leave a gap where an include it lifted out had been', () => {
    const source = lines('-> at_the_gate', '', 'INCLUDE ../arrival/at-the-gate.ink', '', '=== start ===')

    expect(orderIncludes(ENTRY, source, [['arrival/at-the-gate.ink']])).toBe(
      lines('INCLUDE ../arrival/at-the-gate.ink', '', '-> at_the_gate', '', '=== start ===')
    )
  })

  it('declares a file named twice only once', () => {
    const source = lines(
      'INCLUDE ../arrival/at-the-gate.ink',
      'INCLUDE ../arrival/at-the-gate.ink',
      '',
      '-> at_the_gate'
    )

    expect(orderIncludes(ENTRY, source, [['arrival/at-the-gate.ink']])).toBe(
      lines('INCLUDE ../arrival/at-the-gate.ink', '', '-> at_the_gate')
    )
  })

  it('never includes the entry point in itself', () => {
    expect(orderIncludes(ENTRY, lines('-> start'), [[ENTRY]])).toBeNull()
  })

  it('says nothing changed rather than rewriting a file byte for byte', () => {
    const source = lines('INCLUDE ../arrival/at-the-gate.ink', '', '-> at_the_gate')

    expect(orderIncludes(ENTRY, source, [['arrival/at-the-gate.ink']])).toBeNull()
  })

  it('leaves a project with no planned Scenes alone', () => {
    // There is no reading order to impose yet, so a hand-written entry point is
    // not tidied on the author's behalf.
    const source = lines('-> start', '', 'INCLUDE ../maps/world.ink')

    expect(orderIncludes(ENTRY, source, [[], []])).toBeNull()
  })
})
