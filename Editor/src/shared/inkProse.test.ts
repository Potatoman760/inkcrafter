import { describe, expect, it } from 'vitest'
import { inkHazardIn, isSafeInkProse } from './inkProse'

/**
 * Every case here was run through the real ink compiler before being written
 * down. The "safe" list matters as much as the unsafe one: the previous guard
 * threw away any paragraph beginning with `>`, which ink has no opinion about
 * whatsoever.
 */
describe('inkHazardIn', () => {
  describe('prose ink leaves alone', () => {
    const safe = [
      'She arrives at the archive after hours.',
      '"I told you," she said.',
      "'I told you,' she said.",
      '\u201cI told you,\u201d she said.',
      'Wren: "You\'re late."',
      "It doesn't matter.",
      'She waited\u2026 nothing.',
      'She waited \u2014 nothing came.',
      '\u2014 I told you, she said.',
      '> She arrives.',
      'She read [the sign].',
      'A 50% chance.',
      'Salt & pepper.',
      '1996 was the year.',
      'A minus-sign 3-4 thing.',
      'The DONER kebab shop was shut.',
      'END of the line, she thought.',
      'DONE is what she said.'
    ]

    for (const text of safe) {
      it(`allows ${JSON.stringify(text)}`, () => {
        expect(inkHazardIn(text)).toBeNull()
      })
    }
  })

  describe('structure ink would read out of prose', () => {
    // Loud: the story stops compiling.
    it('refuses a brace, which is a compile error', () => {
      expect(inkHazardIn('She counted {one} thing.')).toMatch(/syntax/)
    })

    it('refuses a pipe, which is a compile error', () => {
      expect(inkHazardIn('A choice | another.')).toMatch(/syntax/)
    })

    it('refuses a divert in either direction', () => {
      expect(inkHazardIn('She pointed -> that way.')).toMatch(/divert/)
      expect(inkHazardIn('A <- b.')).toMatch(/divert/)
    })

    for (const keyword of ['INCLUDE', 'VAR', 'CONST', 'LIST', 'EXTERNAL']) {
      it(`refuses a line opening with ${keyword}`, () => {
        expect(inkHazardIn(`${keyword} the room, she thought.`)).toMatch(/declaration/)
      })
    }

    // Quiet: the story compiles and the reader sees the wrong thing. These are
    // the ones the old guard missed, because it only looked at the first
    // character of the paragraph.
    it('refuses a comment anywhere, not only at the start', () => {
      expect(inkHazardIn('The address was http://example.com.')).toMatch(/comment/)
      expect(inkHazardIn('A ratio of 3/*4.')).toMatch(/comment/)
    })

    it('refuses a hash anywhere, which eats the rest of the line as a tag', () => {
      expect(inkHazardIn('She was in Room #3 by then.')).toMatch(/tag/)
    })

    it('refuses glue and backslashes, which vanish', () => {
      expect(inkHazardIn('She waited <> then left.')).toMatch(/glue/)
      expect(inkHazardIn('A path like C:\\ink.')).toMatch(/escape/)
    })

    it('refuses a leading hyphen, which is eaten as a gather', () => {
      // The dash form of dialogue, which would lose its dash and say nothing
      // about having lost it.
      expect(inkHazardIn('- I told you, she said.')).toMatch(/gather/)
    })

    it('refuses a leading asterisk or plus, which become choices', () => {
      expect(inkHazardIn('* She arrives.')).toMatch(/choice/)
      expect(inkHazardIn('+ She arrives.')).toMatch(/choice/)
    })

    it('refuses a leading equals or tilde', () => {
      expect(inkHazardIn('= She arrives.')).toMatch(/knot or stitch/)
      expect(inkHazardIn('~ She arrives.')).toMatch(/logic/)
    })
  })

  it('treats an empty paragraph as unusable', () => {
    expect(inkHazardIn('   ')).not.toBeNull()
    expect(isSafeInkProse('')).toBe(false)
  })

  it('judges the trimmed text, so indentation is not a hazard by itself', () => {
    expect(inkHazardIn('    She arrives.')).toBeNull()
  })
})
