import { describe, expect, it } from 'vitest'
import {
  addAsset,
  addVariant,
  emptyMedia,
  isVideoFile,
  newAsset,
  newVariant,
  parseMedia,
  serialiseMedia,
  setMediaFile
} from './mediaDoc'

describe('isVideoFile', () => {
  it('recognises video URLs with preview revisions and fragments', () => {
    expect(isVideoFile('media/intro.mp4?preview=checkpoint')).toBe(true)
    expect(isVideoFile('https://example.test/rain.WEBM#frame')).toBe(true)
  })

  it('does not mistake a query value for a video extension', () => {
    expect(isVideoFile('media/portrait.png?fallback=clip.mp4')).toBe(false)
  })
})

describe('music files', () => {
  it('writes one direct file instead of a one-item looks array', () => {
    let doc = emptyMedia()
    const track = newAsset('The Grove', 'music')
    doc = addAsset(doc, track)
    doc = setMediaFile(doc, track.id, 'music/the_grove/track.mp3')

    const stored = JSON.parse(serialiseMedia(doc)).assets[0]
    expect(stored).toMatchObject({ kind: 'music', name: 'the_grove', file: 'music/the_grove/track.mp3' })
    expect(stored).not.toHaveProperty('variants')

    const loaded = parseMedia(JSON.stringify({ version: 1, assets: [stored] })).assets[0]!
    expect(loaded.variants).toHaveLength(1)
    expect(loaded.variants[0]).toMatchObject({ name: 'default', file: 'music/the_grove/track.mp3' })
  })

  it('migrates an old one-look track without breaking its explicit legacy tag', () => {
    let doc = emptyMedia()
    const track = newAsset('The Grove', 'music')
    doc = addAsset(doc, track)
    doc = addVariant(doc, track.id, newVariant('loop', 'music/the_grove/loop.mp3'))

    const stored = JSON.parse(serialiseMedia(doc)).assets[0]
    expect(stored).toMatchObject({
      file: 'music/the_grove/loop.mp3',
      legacyVariant: 'loop'
    })
    expect(parseMedia(JSON.stringify({ version: 1, assets: [stored] })).assets[0]!.variants[0]!.name)
      .toBe('loop')
  })

  it('preserves an unusual old multi-variant track until a file is chosen', () => {
    let doc = emptyMedia()
    const track = newAsset('Theme', 'music')
    doc = addAsset(doc, track)
    doc = addVariant(doc, track.id, newVariant('calm', 'music/theme/calm.mp3'))
    doc = addVariant(doc, track.id, newVariant('battle', 'music/theme/battle.mp3'))

    expect(JSON.parse(serialiseMedia(doc)).assets[0].variants).toHaveLength(2)
    expect(setMediaFile(doc, track.id, 'music/theme/calm.mp3').assets[0]!.variants).toHaveLength(1)
  })
})

describe('sound-effect files', () => {
  it('writes one direct file and restores the runtime compatibility entry', () => {
    let doc = emptyMedia()
    const sound = newAsset('Door slam', 'sound')
    doc = addAsset(doc, sound)
    doc = setMediaFile(doc, sound.id, 'sounds/door_slam/effect.ogg')

    const stored = JSON.parse(serialiseMedia(doc)).assets[0]
    expect(stored).toMatchObject({
      kind: 'sound',
      name: 'door_slam',
      file: 'sounds/door_slam/effect.ogg'
    })
    expect(stored).not.toHaveProperty('variants')
    expect(parseMedia(JSON.stringify({ version: 1, assets: [stored] })).assets[0]!.variants[0])
      .toMatchObject({ name: 'default', file: 'sounds/door_slam/effect.ogg' })
  })

  it('keeps an old explicit sound suffix compatible while removing the looks array', () => {
    let doc = emptyMedia()
    const sound = newAsset('Door slam', 'sound')
    doc = addAsset(doc, sound)
    doc = addVariant(doc, sound.id, newVariant('heavy', 'sounds/door_slam/heavy.ogg'))

    const stored = JSON.parse(serialiseMedia(doc)).assets[0]
    expect(stored).toMatchObject({ file: 'sounds/door_slam/heavy.ogg', legacyVariant: 'heavy' })
    expect(parseMedia(JSON.stringify({ version: 1, assets: [stored] })).assets[0]!.variants[0]!.name)
      .toBe('heavy')
  })
})
