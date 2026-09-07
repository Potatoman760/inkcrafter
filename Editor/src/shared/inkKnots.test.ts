import { describe, expect, it } from 'vitest'
import { divertCandidates, knotAt, scanDiverts } from './inkKnots'

/**
 * Where the ink says to go.
 *
 * `scanKnots` answers what a file declares and is exercised through the plan
 * and the editor; this covers the other direction, which the editor turns into
 * followable links — so the cases that matter are the shapes that look like a
 * divert and are not one, and the bare stitch name that means something
 * different depending on where it is written.
 */

describe('scanDiverts', () => {
  it('finds a divert, a tunnel and a thread, with where each name sits', () => {
    const source = ['-> arrival', '<- watchers', '-> shortcut ->'].join('\n')

    expect(scanDiverts(source)).toEqual([
      { target: 'arrival', line: 1, column: 3 },
      { target: 'watchers', line: 2, column: 3 },
      { target: 'shortcut', line: 3, column: 3 }
    ])
  })

  it('reads a stitch, a call with arguments, and several on one line', () => {
    const source = ['-> town.market', '~ temp x = 1', '{met: -> greet | -> stranger}', '-> pay(3)'].join('\n')

    expect(scanDiverts(source).map((one) => one.target)).toEqual([
      'town.market',
      'greet',
      'stranger',
      'pay'
    ])
  })

  // A tunnel return names nothing, and the two reserved words are ways of
  // stopping rather than places a knot declares.
  it('ignores a tunnel return and the reserved endings', () => {
    expect(scanDiverts('->->\n-> END\n-> DONE\n')).toEqual([])
  })

  it('reads a divert before a tag or a comment, and nothing inside one', () => {
    const source = ['-> arrival # bg: harbour', '-> depart // -> nowhere', '// -> ignored', '# note -> ignored'].join('\n')

    expect(scanDiverts(source).map((one) => one.target)).toEqual(['arrival', 'depart'])
  })

  it('reports the column of the name rather than of the arrow', () => {
    const [divert] = scanDiverts('    * [Leave] ->   arrival')

    expect(divert).toEqual({ target: 'arrival', line: 1, column: 19 })
  })
})

describe('knotAt', () => {
  const source = ['=== town ===', 'A road.', '= market', 'Stalls.', '=== function roll(x) ===', '~ return x'].join('\n')

  it('names the innermost section a line sits in', () => {
    expect(knotAt(source, 2)).toBe('town')
    expect(knotAt(source, 4)).toBe('town.market')
  })

  it('answers nothing above the first knot, and does not count a function', () => {
    expect(knotAt(source, 1)).toBe('town')
    expect(knotAt('Loose prose.\n', 1)).toBeNull()
    // A function is called, never travelled to, so a line inside one still
    // belongs to the last real section above it.
    expect(knotAt(source, 6)).toBe('town.market')
  })
})

describe('divertCandidates', () => {
  it('prefers a stitch of the enclosing knot, as ink does', () => {
    expect(divertCandidates('ending', 'chapter_one')).toEqual(['chapter_one.ending', 'ending'])
  })

  it('leaves a qualified name and a name written outside any knot alone', () => {
    expect(divertCandidates('town.market', 'chapter_one')).toEqual(['town.market'])
    expect(divertCandidates('arrival', null)).toEqual(['arrival'])
  })
})
