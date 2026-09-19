import { describe, expect, it } from 'vitest'
import { stagingAt } from './staging'

/** Line numbers are 1-based, so index 0 of this array is line 1. */
const lines = (...text: string[]): string => text.join('\n')

describe('stagingAt', () => {
  const SCENE = lines(
    '=== arrival ===',      // 1
    '# clear',              // 2
    '# bg: harbour/dusk',   // 3
    '# char: wren/happy',   // 4
    'The boats are in.',    // 5
    'Wren waves.'           // 6
  )

  it('collects the tags between the knot header and the cursor', () => {
    expect(stagingAt(SCENE, 6)).toEqual({
      knot: 'arrival',
      tags: ['clear', 'bg: harbour/dusk', 'char: wren/happy']
    })
  })

  it('stops at the cursor, so a tag below it is not on stage yet', () => {
    expect(stagingAt(SCENE, 3).tags).toEqual(['clear', 'bg: harbour/dusk'])
  })

  it('takes the tags on the cursor line itself', () => {
    expect(stagingAt(SCENE, 4).tags).toContain('char: wren/happy')
  })

  it('stages nothing on the header line, where the scene has not started', () => {
    expect(stagingAt(SCENE, 1)).toEqual({ knot: 'arrival', tags: [] })
  })

  it('stops at the knot above, not at the top of the file', () => {
    const source = lines(
      '=== before ===',   // 1
      '# bg: forest',     // 2
      '-> arrival',       // 3
      '',                 // 4
      '=== arrival ===',  // 5
      '# bg: harbour',    // 6
      'The boats are in.' // 7
    )

    expect(stagingAt(source, 7)).toEqual({ knot: 'arrival', tags: ['bg: harbour'] })
  })

  it('reads through a stitch, which is part of its knot', () => {
    const source = lines(
      '=== arrival ===',  // 1
      '# bg: harbour',    // 2
      '',                 // 3
      '= later',          // 4
      'Wren waves.'       // 5
    )

    expect(stagingAt(source, 5)).toEqual({ knot: 'arrival', tags: ['bg: harbour'] })
  })

  it('stops at a function header, because a function body is not a scene', () => {
    const source = lines(
      '=== arrival ===',       // 1
      '# bg: harbour',         // 2
      '',                      // 3
      '=== function score ===', // 4
      '~ return 1'             // 5
    )

    expect(stagingAt(source, 5)).toEqual({ knot: null, tags: [] })
  })

  it('reads a preamble above the first knot', () => {
    const source = lines('# bg: harbour', 'The boats are in.')
    expect(stagingAt(source, 2)).toEqual({ knot: null, tags: ['bg: harbour'] })
  })

  it('ignores a commented-out tag, the way the compiler does', () => {
    const source = lines('=== arrival ===', '// # bg: harbour', '# bg: forest', 'Trees.')
    expect(stagingAt(source, 4).tags).toEqual(['bg: forest'])
  })

  /**
   * The bug this replaced the old preview over: the guard sends the story
   * straight back out under default variables, so playing the knot reached
   * neither tag. Reading the source reaches both.
   */
  it('stages a knot that diverts straight out under default variables', () => {
    const source = lines(
      '=== villa_dinah_master ===',           // 1
      '{trial_ally != "dinah": -> villa_hub}', // 2
      '# clear',                              // 3
      '# bg: consort_villa/yelena',           // 4
      '# char: dinah/neutral at left',        // 5
      'Dinah placed a small prayer bowl.'     // 6
    )

    expect(stagingAt(source, 6)).toEqual({
      knot: 'villa_dinah_master',
      tags: ['clear', 'bg: consort_villa/yelena', 'char: dinah/neutral at left']
    })
  })

  it('keeps source order, so a later tag is the one that wins', () => {
    const source = lines('=== arrival ===', '# bg: harbour', '# clear', '# bg: forest', 'Trees.')
    expect(stagingAt(source, 5).tags).toEqual(['bg: harbour', 'clear', 'bg: forest'])
  })

  it('survives a cursor past the end of the file', () => {
    expect(stagingAt(SCENE, 999).knot).toBe('arrival')
  })
})
