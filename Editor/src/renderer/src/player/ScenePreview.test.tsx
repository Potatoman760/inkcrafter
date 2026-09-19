// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import { ScenePreview } from './ScenePreview'

function media(): MediaDocument {
  let doc = emptyMedia()

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('night', 'bg/cove-night.png'))

  const waves = newAsset('Waves', 'music')
  doc = addAsset(doc, waves)
  doc = addVariant(doc, waves.id, newVariant('', 'music/waves.mp3'))

  return doc
}

const FILES: MediaFile[] = [
  { path: 'sprites/wren-happy.png', bytes: 1, url: 'app://media/p/media/sprites/wren-happy.png' },
  { path: 'bg/cove-night.png', bytes: 1, url: 'app://media/p/media/bg/cove-night.png' },
  { path: 'music/waves.mp3', bytes: 1, url: 'app://media/p/media/music/waves.mp3' }
]

const lines = (...text: string[]): string => text.join('\n')

const SCENE = lines(
  '=== arrival ===',       // 1
  '# clear',               // 2
  '# bg: the_cove/night',  // 3
  '# char: wren/happy',    // 4
  'The cove is quiet.'     // 5
)

function show(source: string, line: number): void {
  render(<ScenePreview source={source} line={line} media={media()} mediaFiles={FILES} />)
}

const images = (): string[] =>
  [...document.querySelectorAll<HTMLImageElement>('.stage img')].map((one) => one.src)

describe('ScenePreview', () => {
  it('draws the staging above the caret', () => {
    show(SCENE, 5)

    expect(images()).toEqual([
      'app://media/p/media/bg/cove-night.png',
      'app://media/p/media/sprites/wren-happy.png'
    ])
  })

  it('names the knot it read down from', () => {
    show(SCENE, 5)
    expect(screen.getByText('arrival')).toBeInTheDocument()
  })

  it('draws only what is above the caret, not the whole knot', () => {
    show(SCENE, 3)
    expect(images()).toEqual(['app://media/p/media/bg/cove-night.png'])
  })

  it('says so on the header line, where nothing is staged yet', () => {
    show(SCENE, 1)
    expect(screen.getByText(/Nothing staged between arrival/)).toBeInTheDocument()
    expect(document.querySelector('.stage')).toBeNull()
  })

  /**
   * The reason this replaced a preview that ran the story: the guard diverts
   * out under default variables, so playing the knot drew an empty stage on a
   * scene whose background is written two lines below the header.
   */
  it('draws a knot that would divert straight out if it were played', () => {
    const source = lines(
      '=== arrival ===',
      '{ally != "wren": -> elsewhere}',
      '# bg: the_cove/night',
      'The cove is quiet.'
    )

    show(source, 4)
    expect(images()).toEqual(['app://media/p/media/bg/cove-night.png'])
  })

  it('draws ink that does not compile, because it never compiles it', () => {
    show(lines('=== arrival ===', '# bg: the_cove/night', '-> nowhere_at_all'), 3)
    expect(images()).toEqual(['app://media/p/media/bg/cove-night.png'])
  })

  it('reports a tag the catalogue has nothing for', () => {
    show(lines('=== arrival ===', '# bg: the_moon', 'Cold.'), 3)
    expect(screen.getByText(/not in the catalogue/)).toBeInTheDocument()
  })

  it('names the track a scene set', () => {
    show(lines('=== arrival ===', '# bg: the_cove/night', '# music: waves loop', 'Quiet.'), 4)
    expect(screen.getByText('Waves')).toBeInTheDocument()
  })

  it('works with no catalogue at all, which is the default', () => {
    render(<ScenePreview source={SCENE} line={5} />)
    // Every tag is then unresolved, which is worth saying rather than a blank
    // frame: the tags are there, it is the catalogue that is not.
    expect(screen.getByText(/bg: the_cove\/night — not in the catalogue/)).toBeInTheDocument()
  })
})
