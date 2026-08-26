import { describe, expect, it } from 'vitest'
import {
  formatTag,
  isKnownTag,
  mediaRefOf,
  parseTag,
  parseTags,
  slotFor,
  type TagCommand
} from './tagSpec'

describe('minigame tags', () => {
  it('round-trips a catalogued encounter name', () => {
    const command = { kind: 'minigame', name: 'alley_guard' } as const
    expect(parseTag(formatTag(command))).toEqual(command)
    expect(parseTag('minigame: two words')).toBeNull()
  })
})

/**
 * The grammar is the contract between two applications, so the cases that
 * matter most are the compatibility ones: every flat tag the player shipped
 * with must still parse, and every variant tag the editor shipped with must
 * still parse, from this one parser.
 */

describe('parseTag', () => {
  it('reads a bare name as its first look', () => {
    expect(parseTag('bg: courtyard')).toEqual({
      kind: 'bg',
      name: 'courtyard',
      variant: null,
      once: false,
      flipped: false
    })
    expect(parseTag('show: abeline')).toEqual({
      kind: 'show',
      name: 'abeline',
      variant: null,
      slot: null,
      flipped: false
    })
  })

  /** The kind it named is gone; so is the tag. */
  it('does not read a play tag at all', () => {
    expect(parseTag('play: fight')).toBeNull()
    expect(parseTag('video: fight')).toBeNull()
  })

  it('reads a named variant', () => {
    expect(parseTag('bg: the_cove/night')).toEqual({
      kind: 'bg',
      name: 'the_cove',
      variant: 'night',
      once: false,
      flipped: false
    })
    expect(parseTag('char: wren/happy')).toEqual({
      kind: 'show',
      name: 'wren',
      variant: 'happy',
      slot: null,
      flipped: false
    })
  })

  it('lets a background play once and hold its final frame', () => {
    expect(parseTag('bg: the_cove/storm once')).toEqual({
      kind: 'bg',
      name: 'the_cove',
      variant: 'storm',
      once: true,
      flipped: false
    })
    expect(parseTag('background: the_cove ONCE')).toEqual({
      kind: 'bg',
      name: 'the_cove',
      variant: null,
      once: true,
      flipped: false
    })
    expect(formatTag(parseTag('bg: the_cove/storm once')!)).toBe('bg: the_cove/storm once')
  })

  it('treats char and show as the same command', () => {
    expect(parseTag('char: wren')).toEqual(parseTag('show: wren'))
  })

  it('accepts the aliases and the spacing an author leaves', () => {
    expect(parseTag('background: courtyard')).toEqual(parseTag('bg: courtyard'))
    expect(parseTag('who: Abeline')).toEqual(parseTag('speaker: Abeline'))
    expect(parseTag('  BG :  wren / happy ')).toEqual({
      kind: 'bg',
      name: 'wren',
      variant: 'happy',
      once: false,
      flipped: false
    })
  })

  it('clears with none', () => {
    expect(parseTag('bg: none')).toEqual({
      kind: 'bg',
      name: null,
      variant: null,
      once: false,
      flipped: false
    })
    // Nobody on screen is what `clear` already meant, so they are one command.
    expect(parseTag('char: none')).toEqual({ kind: 'clear' })
    expect(parseTag('clear')).toEqual({ kind: 'clear' })
  })

  it('lets an empty speaker clear the speaker', () => {
    expect(parseTag('speaker:')).toEqual({ kind: 'speaker', name: '' })
    expect(parseTag('speaker: Sister Abeline')).toEqual({
      kind: 'speaker',
      name: 'Sister Abeline'
    })
  })

  it('reads a stat change with or without spaces', () => {
    expect(parseTag('stat: courage +1')).toEqual({
      kind: 'stat',
      stat: 'courage',
      op: '+',
      value: 1
    })
    expect(parseTag('stat: courage-2')).toEqual({
      kind: 'stat',
      stat: 'courage',
      op: '-',
      value: 2
    })
    expect(parseTag('stat: faith = -3')).toEqual({
      kind: 'stat',
      stat: 'faith',
      op: '=',
      value: -3
    })
    expect(parseTag('stat: courage')).toBeNull()
    expect(parseTag('stat: courage + 1.5')).toBeNull()
  })

  it('reads an npc change, leaving the value typed by the catalogue', () => {
    expect(parseTag('npc: abeline affection +2')).toEqual({
      kind: 'npc',
      id: 'abeline',
      attr: 'affection',
      op: '+',
      value: '2'
    })
    expect(parseTag('npc: abeline status = married')).toEqual({
      kind: 'npc',
      id: 'abeline',
      attr: 'status',
      op: '=',
      value: 'married'
    })
    expect(parseTag('npc: abeline')).toBeNull()
  })

  it('reads the map toggle and nothing else', () => {
    expect(parseTag('map: on')).toEqual({ kind: 'map', enabled: true })
    expect(parseTag('map: OFF')).toEqual({ kind: 'map', enabled: false })
    expect(parseTag('map: maybe')).toBeNull()
  })

  it('reads a bare autosave checkpoint and refuses invented options', () => {
    expect(parseTag('autosave')).toEqual({ kind: 'autosave' })
    expect(parseTag('AUTOSAVE')).toEqual({ kind: 'autosave' })
    expect(parseTag('autosave: on')).toBeNull()
    expect(isKnownTag('autosave: on')).toBe(true)
  })

  it('leaves tags that are not ours alone', () => {
    // ink interpolates before handing the tag over, so this is what arrives.
    expect(parseTag('trust:-2')).toBeNull()
    expect(parseTag('TODO revisit')).toBeNull()
    expect(isKnownTag('trust:-2')).toBe(false)
    expect(isKnownTag('bg: anything')).toBe(true)
  })

  it('drops a tag it owns but cannot read, rather than guessing', () => {
    expect(parseTag('bg:')).toBeNull()
    expect(parseTag('show: 9lives')).toBeNull()
    expect(parseTag('bg: the_cove/')).toBeNull()
    expect(parseTag('bg: the cove')).toBeNull()
  })
})

describe('parseTag: where a character stands', () => {
  it('reads the slot off the end, with or without a look', () => {
    expect(parseTag('char: wren at left')).toEqual({
      kind: 'show',
      name: 'wren',
      variant: null,
      slot: 'left',
      flipped: false
    })
    expect(parseTag('char: wren/happy at RIGHT')).toEqual({
      kind: 'show',
      name: 'wren',
      variant: 'happy',
      slot: 'right',
      flipped: false
    })
  })

  // Saying nothing is not the same as saying "middle": one leaves somebody where
  // they are standing, the other moves them.
  it('leaves the slot unsaid when the tag does not say it', () => {
    expect(parseTag('char: wren')).toMatchObject({ slot: null })
  })

  /**
   * A misspelt slot fails the whole tag, exactly as a misspelt variant does.
   * Standing somebody in the middle because the author wrote `at lft` is a wrong
   * answer wearing the shape of a right one, and preflight reports the drop.
   */
  it('drops the tag when the slot is not one of the three', () => {
    expect(parseTag('char: wren at lft')).toBeNull()
    expect(parseTag('char: wren at')).toBeNull()
    expect(parseTag('char: wren at left at right')).toBeNull()
  })

  it('takes nobody nowhere', () => {
    expect(parseTag('char: none')).toEqual({ kind: 'clear' })
    expect(parseTag('char: none at left')).toBeNull()
  })

  it('offers the clause on nothing but a character', () => {
    expect(parseTag('bg: courtyard at left')).toBeNull()
    expect(parseTag('hide: wren at left')).toBeNull()
    expect(parseTag('music: the_grove at left')).toBeNull()
  })

  /**
   * The one regression that would be silent: a speaker carries prose, and prose
   * contains the word "at". The clause is read inside the character case only.
   */
  it('does not go looking for a slot in free text', () => {
    expect(parseTag('speaker: Sister Abeline at the gate')).toEqual({
      kind: 'speaker',
      name: 'Sister Abeline at the gate'
    })
  })

  it('does not mistake a name that merely starts with at', () => {
    expect(parseTag('char: at_left')).toEqual({
      kind: 'show',
      name: 'at_left',
      variant: null,
      slot: null,
      flipped: false
    })
  })
})

describe('parseTag: who the frame leans on', () => {
  it('names a character, nobody, or the speaker again', () => {
    expect(parseTag('active: wren')).toEqual({
      kind: 'active',
      active: { rule: 'character', name: 'wren' }
    })
    expect(parseTag('active: none')).toEqual({ kind: 'active', active: { rule: 'nobody' } })
    expect(parseTag('active: AUTO')).toEqual({ kind: 'active', active: { rule: 'speaker' } })
  })

  // Unlike a speaker, this names something in the catalogue, so an empty value
  // is far likelier to be a truncated interpolation than an intent.
  it('drops a value it cannot read', () => {
    expect(parseTag('active:')).toBeNull()
    expect(parseTag('active: wren/happy')).toBeNull()
    expect(parseTag('active: 9lives')).toBeNull()
    expect(isKnownTag('active: anything')).toBe(true)
  })
})

describe('slotFor', () => {
  it('moves somebody only when asked to', () => {
    expect(slotFor(undefined, null)).toBe('middle')
    expect(slotFor('left', null)).toBe('left')
    expect(slotFor('left', 'right')).toBe('right')
    expect(slotFor(undefined, 'right')).toBe('right')
  })
})

describe('parseTags', () => {
  it('keeps the ones it knows, in order', () => {
    expect(parseTags(['bg: courtyard', 'trust:-2', 'speaker: Narrator'])).toEqual([
      { kind: 'bg', name: 'courtyard', variant: null, once: false, flipped: false },
      { kind: 'speaker', name: 'Narrator' }
    ])
    expect(parseTags(null)).toEqual([])
  })
})

describe('formatTag', () => {
  const cases: TagCommand[] = [
    { kind: 'bg', name: 'courtyard', variant: null, once: false, flipped: false },
    { kind: 'bg', name: 'the_cove', variant: 'night', once: false, flipped: false },
    { kind: 'bg', name: null, variant: null, once: false, flipped: false },
    { kind: 'show', name: 'wren', variant: 'happy', slot: null, flipped: false },
    { kind: 'show', name: 'wren', variant: 'happy', slot: 'left', flipped: false },
    { kind: 'show', name: 'wren', variant: null, slot: 'right', flipped: false },
    { kind: 'hide', name: 'wren' },
    { kind: 'clear' },
    { kind: 'sound', name: 'door_slam', variant: 'heavy' },
    { kind: 'speaker', name: 'Sister Abeline' },
    { kind: 'speaker', name: '' },
    { kind: 'stat', stat: 'courage', op: '+', value: 1 },
    { kind: 'stat', stat: 'faith', op: '=', value: -3 },
    { kind: 'npc', id: 'abeline', attr: 'status', op: '=', value: 'married' },
    { kind: 'map', enabled: true },
    { kind: 'autosave' },
    { kind: 'active', active: { rule: 'character', name: 'wren' } },
    { kind: 'active', active: { rule: 'nobody' } },
    { kind: 'active', active: { rule: 'speaker' } }
  ]

  // The editor composes tags rather than asking an author to spell them, so
  // anything it can write it must be able to read back.
  it.each(cases)('round-trips $kind', (command) => {
    expect(parseTag(formatTag(command))).toEqual(command)
  })
})

describe('mediaRefOf', () => {
  it('names the file a command needs, and nothing for the ones that need none', () => {
    expect(mediaRefOf({ kind: 'show', name: 'wren', variant: 'happy', slot: 'left', flipped: false })).toEqual({
      kind: 'character',
      name: 'wren',
      variant: 'happy'
    })
    expect(mediaRefOf({ kind: 'bg', name: null, variant: null })).toBeNull()
    // `hide` and `active` both name a character but ask for no picture.
    expect(mediaRefOf({ kind: 'hide', name: 'wren' })).toBeNull()
    expect(mediaRefOf({ kind: 'active', active: { rule: 'character', name: 'wren' } })).toBeNull()
    expect(mediaRefOf({ kind: 'map', enabled: true })).toBeNull()
    expect(mediaRefOf({ kind: 'autosave' })).toBeNull()
    expect(mediaRefOf({ kind: 'sound', name: 'door_slam', variant: null })).toEqual({
      kind: 'sound',
      name: 'door_slam',
      variant: null
    })
  })
})

describe('sound effects', () => {
  it('reads a one-shot cue, with or without a variant', () => {
    expect(parseTag('sound: door_slam')).toEqual({
      kind: 'sound',
      name: 'door_slam',
      variant: null
    })
    expect(parseTag('sound: door_slam/heavy')).toEqual({
      kind: 'sound',
      name: 'door_slam',
      variant: 'heavy'
    })
  })

  it('refuses an empty cue or staging clause', () => {
    expect(parseTag('sound:')).toBeNull()
    expect(parseTag('sound: door_slam at left')).toBeNull()
  })

  it('round-trips and names the sound file to load', () => {
    const command = parseTag('sound: door_slam/heavy')!
    expect(formatTag(command)).toBe('sound: door_slam/heavy')
    expect(mediaRefOf(command)).toEqual({
      kind: 'sound',
      name: 'door_slam',
      variant: 'heavy'
    })
  })
})

/**
 * The track under a scene.
 *
 * A setting rather than an event: unlike a clip, which plays once and is over,
 * this holds across lines and knots until something ends it. Which is the
 * whole reason `stop` exists — silence is not what a scene falls back to.
 */
describe('music', () => {
  it('reads a track, with or without a variant', () => {
    expect(parseTag('music: the_grove')).toEqual({
      kind: 'music',
      name: 'the_grove',
      variant: null
    })
    expect(parseTag('music: the_grove/night')).toEqual({
      kind: 'music',
      name: 'the_grove',
      variant: 'night'
    })
  })

  it('reads stop as naming no track', () => {
    expect(parseTag('music: stop')).toEqual({ kind: 'music', name: null, variant: null })
    expect(parseTag('music: STOP')).toEqual({ kind: 'music', name: null, variant: null })
  })

  it('treats none as a name, since stop is the word that stops it', () => {
    // Worth being sure about: `# bg: none` clears the picture, and somebody
    // will write the same for music. It resolves to nothing and is reported,
    // which is how they find out.
    expect(parseTag('music: none')).toEqual({ kind: 'music', name: 'none', variant: null })
  })

  it('round-trips through formatTag', () => {
    for (const tag of ['music: the_grove', 'music: the_grove/night', 'music: stop']) {
      expect(formatTag(parseTag(tag)!)).toBe(tag)
    }
  })

  it('names a file to load, except when stopping', () => {
    expect(mediaRefOf(parseTag('music: the_grove')!)).toEqual({
      kind: 'music',
      name: 'the_grove',
      variant: null
    })
    expect(mediaRefOf(parseTag('music: stop')!)).toBeNull()
  })
})

/**
 * Which way a character faces.
 *
 * Unlike where she stands, this is stated outright by every `# show:` rather
 * than carried over from the last one that said — so there is no word for
 * turning it off, and a tag that does not say `flipped` means facing the way
 * the art is drawn.
 */
describe('parseTag: which way a character faces', () => {
  it('reads a flip on its own', () => {
    expect(parseTag('show: wren flipped')).toEqual({
      kind: 'show',
      name: 'wren',
      variant: null,
      slot: null,
      flipped: true
    })
  })

  it('reads a flip after where she stands', () => {
    expect(parseTag('show: wren/happy at left flipped')).toEqual({
      kind: 'show',
      name: 'wren',
      variant: 'happy',
      slot: 'left',
      flipped: true
    })
  })

  it('is false when the tag says nothing about it', () => {
    expect(parseTag('show: wren at left')).toMatchObject({ flipped: false })
    expect(parseTag('char: wren')).toMatchObject({ flipped: false })
  })

  it('does not care about case', () => {
    expect(parseTag('show: wren FLIPPED')).toMatchObject({ flipped: true })
  })

  /** The same trap `at` has: a character may legitimately be called this. */
  it('does not mistake a name that merely ends in flipped', () => {
    expect(parseTag('show: unflipped')).toMatchObject({ name: 'unflipped', flipped: false })
    expect(parseTag('show: wren_flipped')).toMatchObject({
      name: 'wren_flipped',
      flipped: false
    })
  })

  it('refuses a slot it does not know, flip or no flip', () => {
    expect(parseTag('show: wren at sideways flipped')).toBeNull()
  })

  it('writes it back last, after the slot', () => {
    expect(formatTag({ kind: 'show', name: 'wren', variant: null, slot: 'left', flipped: true })).toBe(
      'show: wren at left flipped'
    )
    expect(formatTag({ kind: 'show', name: 'wren', variant: 'happy', slot: null, flipped: true })).toBe(
      'show: wren/happy flipped'
    )
    expect(
      formatTag({ kind: 'show', name: 'wren', variant: null, slot: 'left', flipped: false })
    ).toBe('show: wren at left')
  })

  it('round-trips', () => {
    for (const raw of ['show: wren flipped', 'show: wren/happy at right flipped']) {
      expect(formatTag(parseTag(raw)!)).toBe(raw)
    }
  })
})

/**
 * Which way round the place is drawn.
 *
 * The same word as a character's flip and the same meaning, but a setting
 * rather than a per-line statement — because that is what a background is. It
 * holds until another `# bg:` says otherwise, so re-showing the same place
 * without the word turns it back.
 *
 * `once` and `flipped` may arrive in either order: one is about the clip and
 * one about the artwork, so neither qualifies the other and there is no reason
 * to insist on a sequence.
 */
describe('parseTag: which way round a background is drawn', () => {
  it('reads a flip on its own', () => {
    expect(parseTag('bg: corridor flipped')).toEqual({
      kind: 'bg',
      name: 'corridor',
      variant: null,
      once: false,
      flipped: true
    })
  })

  it('reads a flip beside a look', () => {
    expect(parseTag('bg: corridor/dusk flipped')).toMatchObject({
      name: 'corridor',
      variant: 'dusk',
      flipped: true
    })
  })

  it('reads a flip and a play-once in either order', () => {
    const both = { kind: 'bg', name: 'corridor', variant: null, once: true, flipped: true }
    expect(parseTag('bg: corridor once flipped')).toEqual(both)
    expect(parseTag('bg: corridor flipped once')).toEqual(both)
  })

  it('does not care about case', () => {
    expect(parseTag('background: corridor FLIPPED')).toMatchObject({ flipped: true })
  })

  /** The same trap `once` has: a background may legitimately be called this. */
  it('does not mistake a name that merely ends in flipped', () => {
    expect(parseTag('bg: unflipped')).toMatchObject({ name: 'unflipped', flipped: false })
    expect(parseTag('bg: cove_flipped')).toMatchObject({ name: 'cove_flipped', flipped: false })
  })

  it('refuses a word said twice rather than absorbing it', () => {
    expect(parseTag('bg: corridor flipped flipped')).toBeNull()
    expect(parseTag('bg: corridor once once')).toBeNull()
  })

  /** An empty frame has no artwork for either word to be about. */
  it('refuses to flip nothing', () => {
    expect(parseTag('bg: none flipped')).toBeNull()
    expect(parseTag('bg: none once')).toBeNull()
  })

  it('writes it back last, after the play-once', () => {
    expect(
      formatTag({ kind: 'bg', name: 'corridor', variant: 'dusk', once: true, flipped: true })
    ).toBe('bg: corridor/dusk once flipped')
    expect(
      formatTag({ kind: 'bg', name: 'corridor', variant: null, once: false, flipped: false })
    ).toBe('bg: corridor')
  })

  it('round-trips', () => {
    for (const raw of ['bg: corridor flipped', 'bg: corridor/dusk once flipped']) {
      expect(formatTag(parseTag(raw)!)).toBe(raw)
    }
  })
})

/**
 * Animations, which are shown over the scene rather than standing in it.
 *
 * A looping file either fills the frame behind everything, which is a
 * background, or runs over the top of it, which is this. `# play:` was a third
 * answer — a clip that ran once and ended — and it turned out to be describing
 * the file rather than the story, so it is gone.
 */
describe('parseTag: animations', () => {
  it('reads one', () => {
    expect(parseTag('anim: rain')).toEqual({
      kind: 'anim',
      name: 'rain',
      variant: null,
      flipped: false
    })
  })

  /**
   * It fills the frame rather than taking a third of it, so `at left` names
   * nothing it could do. Refused rather than ignored, so the author finds out.
   */
  it('refuses a slot', () => {
    expect(parseTag('anim: rain at left')).toBeNull()
    expect(parseTag('anim: rain/heavy at middle flipped')).toBeNull()
  })

  it('answers to the long spelling too', () => {
    expect(parseTag('animation: rain')).toMatchObject({ kind: 'anim', name: 'rain' })
  })

  it('takes a look and a flip', () => {
    expect(parseTag('anim: rain/heavy flipped')).toEqual({
      kind: 'anim',
      name: 'rain',
      variant: 'heavy',
      flipped: true
    })
  })

  /** Stops every one of them, without touching who is on stage. */
  it('reads none as stopping them all', () => {
    expect(parseTag('anim: none')).toEqual({
      kind: 'anim',
      name: null,
      variant: null,
      flipped: false
    })
  })

  it('refuses to put nothing somewhere', () => {
    expect(parseTag('anim: none at left')).toBeNull()
  })



  it('round-trips', () => {
    for (const raw of ['anim: rain', 'anim: rain/heavy flipped', 'anim: none']) {
      expect(formatTag(parseTag(raw)!)).toBe(raw)
    }
  })

  it('names a file to load, except when it is stopping them', () => {
    expect(mediaRefOf(parseTag('anim: rain/heavy')!)).toEqual({
      kind: 'animation',
      name: 'rain',
      variant: 'heavy'
    })
    expect(mediaRefOf(parseTag('anim: none')!)).toBeNull()
  })
})
