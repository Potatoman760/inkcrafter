import { describe, expect, it } from 'vitest'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from './mediaDoc'
import {
  applyTags,
  EMPTY_SCENE,
  formatMediaTag,
  isMediaTag,
  parseMediaTag,
  resolveMediaTag,
  sceneFrom
} from './mediaTag'

function seeded(): MediaDocument {
  let doc = emptyMedia()

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('neutral', 'sprites/wren-neutral.png'))
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  const archivist = newAsset('Archivist', 'character')
  doc = addAsset(doc, archivist)
  doc = addVariant(doc, archivist.id, newVariant('neutral', 'sprites/archivist.png'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('day', 'bg/cove-day.png'))
  doc = addVariant(doc, cove.id, newVariant('night', 'bg/cove-night.png'))

  return doc
}

describe('parseMediaTag', () => {
  it('reads a character with a variant', () => {
    expect(parseMediaTag('char:wren/happy')).toMatchObject({
      kind: 'character',
      name: 'wren',
      variant: 'happy'
    })
  })

  it('reads a background', () => {
    expect(parseMediaTag('bg:the_cove/night')).toMatchObject({
      kind: 'background',
      name: 'the_cove',
      variant: 'night'
    })
  })

  it('reads a bare name as "whichever comes first"', () => {
    expect(parseMediaTag('char:wren')).toMatchObject({ name: 'wren', variant: null })
  })

  it('tolerates the spacing an author might leave', () => {
    expect(parseMediaTag('# char: wren / happy')).toMatchObject({ name: 'wren', variant: 'happy' })
  })

  /**
   * The seeded project carries `#trust:{archivist_trust}`, and ink interpolates
   * that before the tag is handed over — so what arrives is `trust:-2`. A parser
   * claiming unknown prefixes would start eating tags meant for something else.
   */
  it('leaves a tag that is not media alone', () => {
    expect(parseMediaTag('trust:-2')).toBeNull()
    expect(parseMediaTag('scene:corridor')).toBeNull()
    expect(parseMediaTag('audio:waves')).toBeNull()
  })

  it('refuses a tag with no name, or a name ink could not carry', () => {
    expect(parseMediaTag('char:')).toBeNull()
    expect(parseMediaTag('char:wren/')).toBeNull()
    expect(parseMediaTag('char:9lives')).toBeNull()
    expect(parseMediaTag('char:wren happy')).toBeNull()
    expect(parseMediaTag('nocolon')).toBeNull()
  })

  it('knows a tag is addressed to media even when it is malformed', () => {
    expect(isMediaTag('char:')).toBe(true)
    expect(isMediaTag('trust:-2')).toBe(false)
  })
})

describe('formatMediaTag', () => {
  it('writes what parseMediaTag reads back', () => {
    const doc = seeded()
    const wren = doc.assets[0]!

    expect(formatMediaTag(wren, wren.variants[1])).toBe('char:wren/happy')
    expect(formatMediaTag(wren)).toBe('char:wren')
    expect(parseMediaTag(formatMediaTag(wren, wren.variants[1])!)).toMatchObject({
      name: 'wren',
      variant: 'happy'
    })
  })

  it('writes music as the track name without exposing its compatibility variant', () => {
    const track = newAsset('The grove', 'music')
    const file = newVariant('default', 'music/the_grove/track.mp3')

    expect(formatMediaTag(track, file)).toBe('music:the_grove')
  })

  it('writes a sound effect without exposing its compatibility variant', () => {
    const sound = newAsset('Door slam', 'sound')
    const file = newVariant('heavy', 'sounds/door_slam/heavy.ogg')

    expect(formatMediaTag(sound, file)).toBe('sound:door_slam')
  })
})

describe('resolveMediaTag', () => {
  const doc = seeded()

  it('finds the file a tag points at', () => {
    expect(resolveMediaTag(doc, 'char:wren/happy')?.path).toBe('media/sprites/wren-happy.png')
  })

  it('takes the first variant for a bare name', () => {
    expect(resolveMediaTag(doc, 'char:wren')?.path).toBe('media/sprites/wren-neutral.png')
  })

  it('lets a background and a character share a name', () => {
    // The tag carries the kind, so there is no ambiguity to resolve.
    let both = addAsset(doc, newAsset('wren', 'background'))
    const bg = both.assets.at(-1)!
    both = addVariant(both, bg.id, newVariant('wide', 'bg/wren-room.png'))

    expect(resolveMediaTag(both, 'char:wren')?.path).toBe('media/sprites/wren-neutral.png')
    expect(resolveMediaTag(both, 'bg:wren')?.path).toBe('media/bg/wren-room.png')
  })

  // Showing the wrong expression is worse than showing none, and the preview
  // says which tag failed.
  it('resolves to nothing rather than guessing when the variant is unknown', () => {
    expect(resolveMediaTag(doc, 'char:wren/furious')).toBeNull()
  })

  it('resolves to nothing when the asset is unknown', () => {
    expect(resolveMediaTag(doc, 'char:nobody')).toBeNull()
  })

  it('resolves to nothing for an asset with no variants at all', () => {
    const bare = addAsset(emptyMedia(), newAsset('ghost', 'character'))
    expect(resolveMediaTag(bare, 'char:ghost')).toBeNull()
  })
})

/**
 * Tags arrive one set per line, and a background set on one line has to stay up
 * while the next paragraph carries none. Cumulative, not per-line.
 */
describe('applyTags', () => {
  const doc = seeded()

  it('keeps what an untagged line does not mention', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['bg:the_cove/night', 'char:wren/happy'])
    scene = applyTags(doc, scene, [])

    expect(scene.background?.variant.name).toBe('night')
    expect(scene.characters[0]?.variant.name).toBe('happy')
  })

  it('lets a later tag change a character already on screen', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren/neutral'])
    scene = applyTags(doc, scene, ['char:wren/happy'])

    expect(scene.characters[0]?.variant.name).toBe('happy')
  })

  it('changes the background without disturbing the character', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren/happy', 'bg:the_cove/day'])
    scene = applyTags(doc, scene, ['bg:the_cove/night'])

    expect(scene.background?.variant.name).toBe('night')
    expect(scene.characters[0]?.variant.name).toBe('happy')
  })

  // `char:none` is the legacy spelling of `clear`; both empty the visible stage.
  it('clears the visible stage with the legacy char:none spelling', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren/happy', 'bg:the_cove/day'])
    scene = applyTags(doc, scene, ['char:none'])

    expect(scene.characters).toEqual([])
    expect(scene.background).toBeNull()
  })

  it('records a media tag that named nothing, rather than sitting blank', () => {
    const scene = applyTags(doc, EMPTY_SCENE, ['char:wren/furious'])

    expect(scene.characters).toEqual([])
    expect(scene.unresolved).toEqual(['char:wren/furious'])
  })

  it('does not record the same failure twice', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:nobody'])
    scene = applyTags(doc, scene, ['char:nobody'])

    expect(scene.unresolved).toEqual(['char:nobody'])
  })

  it('ignores tags that are not media', () => {
    const scene = applyTags(doc, EMPTY_SCENE, ['trust:-2', 'scene:corridor'])

    expect(scene).toEqual(EMPTY_SCENE)
  })

  // The game has always drawn several sprites at once; a preview showing one
  // would disagree with it about what a scene looks like.
  it('keeps several characters on screen at once', () => {
    const scene = applyTags(doc, EMPTY_SCENE, ['char:wren/happy', 'char:archivist'])

    expect(scene.characters.map((one) => one.asset.name)).toEqual(['wren', 'archivist'])
  })

  it('changes a look in place rather than drawing the same character twice', () => {
    const scene = applyTags(doc, EMPTY_SCENE, [
      'char:wren/neutral',
      'char:archivist',
      'char:wren/happy'
    ])

    expect(scene.characters.map((one) => one.asset.name)).toEqual(['wren', 'archivist'])
    expect(scene.characters[0]?.variant.name).toBe('happy')
  })

  it('takes one character off with hide and clears the whole visible stage with clear', () => {
    let scene = applyTags(doc, EMPTY_SCENE, [
      'bg:the_cove/day',
      'char:wren/happy',
      'char:archivist'
    ])
    scene = applyTags(doc, scene, ['hide:wren'])
    expect(scene.characters.map((one) => one.asset.name)).toEqual(['archivist'])

    scene = applyTags(doc, scene, ['clear'])
    expect(scene.characters).toEqual([])
    expect(scene.background).toBeNull()
  })

  it('stands a newcomer in the middle, and puts them where the tag asks', () => {
    const scene = applyTags(doc, EMPTY_SCENE, ['char:wren', 'char:archivist at right'])

    expect(scene.slots).toEqual({ wren: 'middle', archivist: 'right' })
  })

  // A change of expression is not also a walk across the stage.
  it('leaves somebody where they are standing when the tag says nothing', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren/neutral at left'])
    scene = applyTags(doc, scene, ['char:wren/happy'])

    expect(scene.slots['wren']).toBe('left')
    expect(scene.characters[0]?.variant.name).toBe('happy')
  })

  it('moves somebody when the tag does say', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren at left'])
    scene = applyTags(doc, scene, ['char:wren at right'])

    expect(scene.slots['wren']).toBe('right')
    expect(scene.characters).toHaveLength(1)
  })

  // A slot left behind would come back to life the next time that character is
  // shown, three scenes later, standing somewhere nobody asked for.
  it('forgets where somebody stood once they leave', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren at left', 'char:archivist at right'])
    scene = applyTags(doc, scene, ['hide:wren'])
    expect(scene.slots).toEqual({ archivist: 'right' })

    scene = applyTags(doc, scene, ['clear'])
    expect(scene.slots).toEqual({})
  })

  it('tracks who the frame leans on, and hands it back with auto', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren', 'active: wren'])
    expect(scene.activeRule).toEqual({ rule: 'character', name: 'wren' })

    scene = applyTags(doc, scene, ['active: none'])
    expect(scene.activeRule).toEqual({ rule: 'nobody' })

    scene = applyTags(doc, scene, ['active: auto'])
    expect(scene.activeRule).toEqual({ rule: 'speaker' })
  })

  it('leans on nobody again once the stage is cleared', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['char:wren', 'active: wren'])
    scene = applyTags(doc, scene, ['clear'])

    expect(scene.activeRule).toEqual({ rule: 'speaker' })
  })

  it('clears the background with none, and only the background', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['bg:the_cove/day', 'char:wren/happy'])
    scene = applyTags(doc, scene, ['bg:none'])

    expect(scene.background).toBeNull()
    expect(scene.characters).toHaveLength(1)
  })

  // Not pictures, but they are things a tag sets and a reader would notice.
  it('tracks the speaker and whether the map is reachable', () => {
    let scene = applyTags(doc, EMPTY_SCENE, ['speaker: Wren', 'map: off'])
    expect(scene.speaker).toBe('Wren')
    expect(scene.mapEnabled).toBe(false)

    scene = applyTags(doc, scene, ['speaker:', 'map: on'])
    expect(scene.speaker).toBe('')
    expect(scene.mapEnabled).toBe(true)
  })

  /**
   * `# play:` named a clip that ran once and ended. Backgrounds and animations
   * both take a looping file now, which left it naming a distinction that was
   * about the file rather than about the story.
   *
   * Gone means gone: it is not a media tag any more, so it is passed over the
   * way any tag the app does not own is, rather than reported as a mistake.
   */
  it('passes over a play tag, which is no longer a tag it owns', () => {
    const scene = applyTags(doc, EMPTY_SCENE, ['play:nothing_like_it'])

    expect(scene.unresolved).toEqual([])
    expect(scene.characters).toEqual([])
    expect(scene.background).toBeNull()
  })
})

describe('sceneFrom', () => {
  it('folds a whole reading into the scene it leaves behind', () => {
    const doc = seeded()
    const scene = sceneFrom(doc, [
      ['bg:the_cove/day'],
      [],
      ['char:wren/neutral'],
      [],
      ['char:wren/happy', 'bg:the_cove/night']
    ])

    expect(scene.background?.path).toBe('media/bg/cove-night.png')
    expect(scene.characters[0]?.path).toBe('media/sprites/wren-happy.png')
  })

  it('is empty for a story with no media tags', () => {
    expect(sceneFrom(seeded(), [[], ['trust:0'], []])).toEqual(EMPTY_SCENE)
  })
})

/**
 * Music in a scene.
 *
 * The behaviour the author asked for: it keeps playing until an explicit
 * command ends it. That is the same folding every other setting gets, so what
 * these pin down is that it really is folded the same way — and that stopping
 * actually stops.
 */
describe('the track under a scene', () => {
  function seededMusic(): MediaDocument {
    let doc = emptyMedia()
    const grove = newAsset('The grove', 'music')
    doc = addAsset(doc, grove)
    doc = addVariant(doc, grove.id, newVariant('loop', 'music/the_grove/loop.mp3'))

    const storm = newAsset('The storm', 'music')
    doc = addAsset(doc, storm)
    doc = addVariant(doc, storm.id, newVariant('loop', 'music/the_storm/loop.mp3'))
    return doc
  }

  it('starts a track', () => {
    const scene = sceneFrom(seededMusic(), [['music:the_grove']])
    expect(scene.music?.path).toBe('media/music/the_grove/loop.mp3')
  })

  it('keeps playing across lines and knots that say nothing', () => {
    const scene = sceneFrom(seededMusic(), [['music:the_grove'], [], ['speaker:Kael'], []])
    expect(scene.music?.path).toBe('media/music/the_grove/loop.mp3')
  })

  it('changes to another track without needing to be stopped first', () => {
    const scene = sceneFrom(seededMusic(), [['music:the_grove'], ['music:the_storm']])
    expect(scene.music?.path).toBe('media/music/the_storm/loop.mp3')
  })

  it('stops when told to, and stays stopped', () => {
    const scene = sceneFrom(seededMusic(), [['music:the_grove'], ['music:stop'], []])
    expect(scene.music).toBeNull()
  })

  it('reports a track that is not in the catalogue rather than falling silent', () => {
    const scene = sceneFrom(seededMusic(), [['music:the_grove'], ['music:nowhere']])

    // The one already playing is left alone: a tag that resolved to nothing
    // asked for something, and silence would look like it had worked.
    expect(scene.music?.path).toBe('media/music/the_grove/loop.mp3')
    expect(scene.unresolved).toContain('music:nowhere')
  })

  /**
   * How the music ended, carried so the rail can say it and the game can do it.
   * It describes the stop, so anything that puts a track back on clears it.
   */
  describe('fading out', () => {
    it('records the seconds a stop was given', () => {
      const scene = sceneFrom(seededMusic(), [['music:the_grove'], ['music:stop 5']])

      expect(scene.music).toBeNull()
      expect(scene.musicFade).toBe(5)
    })

    it('is nothing at all for a stop that cuts', () => {
      expect(sceneFrom(seededMusic(), [['music:the_grove'], ['music:stop']]).musicFade).toBe(0)
      expect(sceneFrom(seededMusic(), []).musicFade).toBe(0)
    })

    it('holds while the music stays stopped', () => {
      const scene = sceneFrom(seededMusic(), [['music:stop 5'], [], ['speaker:Kael']])
      expect(scene.musicFade).toBe(5)
    })

    it('is cleared by a track starting, which has nothing to fade', () => {
      const scene = sceneFrom(seededMusic(), [['music:stop 5'], ['music:the_storm']])

      expect(scene.music?.path).toBe('media/music/the_storm/loop.mp3')
      expect(scene.musicFade).toBe(0)
    })
  })
})

describe('sound cues', () => {
  function seededSounds(): MediaDocument {
    let doc = emptyMedia()
    const door = newAsset('Door slam', 'sound')
    doc = addAsset(doc, door)
    return addVariant(doc, door.id, newVariant('heavy', 'sounds/door_slam/heavy.ogg'))
  }

  it('validates a cue without carrying it into scene state', () => {
    expect(sceneFrom(seededSounds(), [['sound:door_slam/heavy'], []])).toEqual(EMPTY_SCENE)
  })

  it('reports a cue that names nothing', () => {
    expect(sceneFrom(seededSounds(), [['sound:glass_break']]).unresolved).toEqual([
      'sound:glass_break'
    ])
  })
})

/**
 * Which way a character faces.
 *
 * The one that behaves differently from everything else in a scene: a slot is
 * remembered until something moves her, and a flip is restated by every
 * `# show:`. Showing her again without saying `flipped` turns her back.
 */
describe('flipping a character', () => {
  it('marks her mirrored', () => {
    const scene = sceneFrom(seeded(), [['show: wren at left flipped']])

    expect(scene.flipped['wren']).toBe(true)
    expect(scene.slots['wren']).toBe('left')
  })

  it('leaves her as drawn when the tag says nothing', () => {
    const scene = sceneFrom(seeded(), [['show: wren at left']])

    expect(scene.flipped['wren']).toBe(false)
  })

  /** The whole difference from the slot, in one case. */
  it('is turned back by the next show that does not say it', () => {
    const scene = sceneFrom(seeded(), [['show: wren flipped'], ['show: wren/happy']])

    expect(scene.flipped['wren']).toBe(false)
    // Where she stands is remembered, which is what makes the contrast worth
    // stating: the two are deliberately not the same.
    expect(scene.slots['wren']).toBe('middle')
  })

  it('holds across lines that do not mention her at all', () => {
    const scene = sceneFrom(seeded(), [['show: wren flipped'], [], ['speaker: Wren']])

    expect(scene.flipped['wren']).toBe(true)
  })

  it('is one character at a time', () => {
    const scene = sceneFrom(seeded(), [
      ['show: wren at left flipped', 'show: archivist at right']
    ])

    expect(scene.flipped['wren']).toBe(true)
    expect(scene.flipped['archivist']).toBe(false)
  })

  it('is forgotten when she leaves', () => {
    const scene = sceneFrom(seeded(), [['show: wren flipped'], ['hide: wren']])

    expect(scene.flipped['wren']).toBeUndefined()
  })

  it('is forgotten when the stage clears', () => {
    const scene = sceneFrom(seeded(), [['show: wren flipped'], ['clear']])

    expect(scene.flipped).toEqual({})
  })
})

/**
 * Flipping the background.
 *
 * The same word as a character's flip, but behaving like the background it is
 * on: a setting that holds until another `# bg:` says otherwise, rather than
 * something every tag restates. It goes with the background, so a place turned
 * round cannot leave its flip behind for whatever is set next.
 */
describe('flipping the background', () => {
  it('marks it mirrored', () => {
    expect(sceneFrom(seeded(), [['bg: the_cove/night flipped']]).backgroundFlipped).toBe(true)
  })

  it('leaves it as drawn when the tag says nothing', () => {
    expect(sceneFrom(seeded(), [['bg: the_cove/night']]).backgroundFlipped).toBe(false)
  })

  it('holds across lines that do not mention it', () => {
    const scene = sceneFrom(seeded(), [['bg: the_cove/night flipped'], [], ['speaker: Wren']])

    expect(scene.backgroundFlipped).toBe(true)
  })

  it('is turned back by the next background that does not say it', () => {
    const scene = sceneFrom(seeded(), [['bg: the_cove/night flipped'], ['bg: the_cove/day']])

    expect(scene.backgroundFlipped).toBe(false)
  })

  it('does not outlive the background it was on', () => {
    for (const ending of ['bg: none', 'clear']) {
      const scene = sceneFrom(seeded(), [['bg: the_cove/night flipped'], [ending]])

      expect(scene.background).toBeNull()
      expect(scene.backgroundFlipped).toBe(false)
    }
  })

  it('is independent of the flips on the cast', () => {
    const scene = sceneFrom(seeded(), [['bg: the_cove/night flipped', 'show: wren']])

    expect(scene.backgroundFlipped).toBe(true)
    expect(scene.flipped['wren']).toBe(false)
  })
})

/**
 * Animations on the stage.
 *
 * Staged exactly like the cast — a slot that carries over, a flip stated by
 * every tag — and kept in their own list, because a story may perfectly well
 * have a character called `rain` and an effect called `rain`.
 */
describe('animations', () => {
  function withRain(): MediaDocument {
    let doc = seeded()

    const rain = newAsset('Rain', 'animation')
    doc = addAsset(doc, rain)
    doc = addVariant(doc, rain.id, newVariant('heavy', 'animations/rain/heavy.webm'))

    const embers = newAsset('Embers', 'animation')
    doc = addAsset(doc, embers)
    doc = addVariant(doc, embers.id, newVariant('idle', 'animations/embers/idle.gif'))

    return doc
  }

  it('puts one over the scene', () => {
    const scene = sceneFrom(withRain(), [['anim: rain']])

    expect(scene.animations.map((one) => one.asset.name)).toEqual(['rain'])
  })

  /**
   * It fills the frame, so there is nothing for a slot to mean. Refused rather
   * than ignored: a word that quietly does nothing is a word an author goes on
   * writing, and `preflight` reports an unreadable tag on the way out.
   */
  it('refuses a slot, because it has nowhere to stand', () => {
    const scene = sceneFrom(withRain(), [['anim: rain at left']])

    expect(scene.animations).toEqual([])
  })

  it('keeps the cast out of it', () => {
    const scene = sceneFrom(withRain(), [['show: wren at left', 'anim: rain']])

    expect(scene.characters.map((one) => one.asset.name)).toEqual(['wren'])
    expect(scene.animations.map((one) => one.asset.name)).toEqual(['rain'])
  })

  it('holds across lines that say nothing', () => {
    const scene = sceneFrom(withRain(), [['anim: rain'], [], ['speaker: Wren']])

    expect(scene.animations).toHaveLength(1)
  })

  /** Turned round is about the artwork, so every tag restates it. */
  it('restates the flip, like a character', () => {
    const scene = sceneFrom(withRain(), [['anim: rain flipped'], ['anim: rain/heavy']])

    expect(scene.animFlipped['rain']).toBe(false)
  })

  it('turns one round', () => {
    expect(sceneFrom(withRain(), [['anim: rain flipped']]).animFlipped['rain']).toBe(true)
  })

  /** Layered in the order the tags came, for a transparent effect over another. */
  it('runs several at once', () => {
    const scene = sceneFrom(withRain(), [['anim: rain', 'anim: embers']])

    expect(scene.animations.map((one) => one.asset.name)).toEqual(['rain', 'embers'])
  })

  it('stops all of them without touching the cast', () => {
    const scene = sceneFrom(withRain(), [
      ['show: wren at left', 'anim: rain', 'anim: embers'],
      ['anim: none']
    ])

    expect(scene.animations).toEqual([])
    expect(scene.animFlipped).toEqual({})
    expect(scene.characters).toHaveLength(1)
  })

  /** `hide` names a thing on the stage rather than a kind of thing. */
  it('is taken off by hide, the same as a character', () => {
    const scene = sceneFrom(withRain(), [['anim: rain', 'anim: embers'], ['hide: rain']])

    expect(scene.animations.map((one) => one.asset.name)).toEqual(['embers'])
    expect(scene.animFlipped['rain']).toBeUndefined()
  })

  /** What an author writes at a scene change, so it takes everything. */
  it('is cleared with the rest of the stage', () => {
    const scene = sceneFrom(withRain(), [['show: wren', 'anim: rain'], ['clear']])

    expect(scene.animations).toEqual([])
    expect(scene.characters).toEqual([])
  })

  it('reports one that names nothing, rather than sitting blank', () => {
    const scene = sceneFrom(withRain(), [['anim: snow']])

    expect(scene.unresolved).toEqual(['anim: snow'])
    expect(scene.animations).toEqual([])
  })
})
