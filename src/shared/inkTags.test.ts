import { describe, expect, it } from 'vitest'
import { scanTags } from './inkTags'

/**
 * Reading tags out of source rather than out of a running story, because the
 * tag that is wrong is nearly always on the branch nobody played.
 */
describe('scanTags', () => {
  it('finds a tag and says which line it was on', () => {
    const found = scanTags('Hello.\nThe gate opens. # bg: courtyard\n')

    expect(found).toEqual([
      {
        raw: 'bg: courtyard',
        command: { kind: 'bg', name: 'courtyard', variant: null, once: false, flipped: false },
        line: 2,
        from: 16,
        to: 31
      }
    ])
  })

  it('finds several on one line', () => {
    const found = scanTags('The gate opens. # bg: courtyard # show: abeline/happy')

    expect(found.map((use) => use.raw)).toEqual(['bg: courtyard', 'show: abeline/happy'])
  })

  /**
   * The span is what lets one tag be rewritten in place. It has to stop at the
   * tag's own last character rather than at the next `#`, or rewriting the
   * first of two would eat the space between them.
   */
  describe('the span it reports', () => {
    const spanOf = (line: string, at = 0): string => {
      const use = scanTags(line)[at]!
      return line.slice(use.from, use.to)
    }

    it('covers the hash and the tag, and nothing after it', () => {
      const line = 'The gate opens. # bg: courtyard # show: abeline'
      expect(spanOf(line, 0)).toBe('# bg: courtyard')
      expect(spanOf(line, 1)).toBe('# show: abeline')
    })

    it('leaves trailing space out of it', () => {
      expect(spanOf('# map: off   ')).toBe('# map: off')
    })

    /**
     * Comments are blanked rather than deleted, so a tag after one still knows
     * where it is. This is the case that would break silently: the span would
     * be shifted left by however long the comment was.
     */
    it('is right on a line that had a block comment in it', () => {
      const line = 'She /* pauses */ turns. # bg: sanctum'
      expect(spanOf(line)).toBe('# bg: sanctum')
    })

    it('is right on the line after a block comment closes', () => {
      const source = '/* a\nb */ Real. # bg: sanctum'
      const use = scanTags(source)[0]!
      expect(use.line).toBe(2)
      expect(source.split('\n')[1]!.slice(use.from, use.to)).toBe('# bg: sanctum')
    })
  })

  it('finds a tag on a line of its own', () => {
    expect(scanTags('=== start ===\n# map: off\n').map((use) => use.raw)).toEqual(['map: off'])
  })

  it('ignores a tag inside a comment', () => {
    expect(scanTags('// # bg: courtyard\n')).toEqual([])
    expect(scanTags('Text. // trailing # bg: courtyard\n')).toEqual([])
  })

  it('ignores a tag inside a block comment, across lines', () => {
    const source = '/*\n# bg: courtyard\n*/\nReal. # bg: sanctum\n'

    expect(scanTags(source).map((use) => use.raw)).toEqual(['bg: sanctum'])
  })

  // Inside braces a `#` belongs to an expression, not to us.
  it('ignores a hash inside interpolation', () => {
    expect(scanTags('Count: {courage # not a tag}\n')).toEqual([])
    expect(scanTags('{courage} lives. # bg: sanctum').map((use) => use.raw)).toEqual([
      'bg: sanctum'
    ])
  })

  it('reports a tag it owns but cannot read, with a null command', () => {
    const found = scanTags('# stat: courage\n')

    expect(found[0]?.raw).toBe('stat: courage')
    expect(found[0]?.command).toBeNull()
  })

  it('carries tags that are not ours through untouched', () => {
    const found = scanTags('Line. # trust:-2\n')

    expect(found[0]?.raw).toBe('trust:-2')
    expect(found[0]?.command).toBeNull()
  })
})
