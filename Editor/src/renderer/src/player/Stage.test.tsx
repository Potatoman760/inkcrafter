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
import { sceneFrom, EMPTY_SCENE } from '@shared/mediaTag'
import type { MediaFile } from '@shared/types'
import { Stage } from './Stage'

function seeded(): MediaDocument {
  let doc = emptyMedia()

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  const kael = newAsset('Kael', 'character')
  doc = addAsset(doc, kael)
  doc = addVariant(doc, kael.id, newVariant('neutral', 'sprites/kael-neutral.png'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('night', 'bg/cove-night.png'))
  // The same kind of asset, as a looping clip: what a background *is* on disk
  // is a separate question from what it is *for*.
  doc = addVariant(doc, cove.id, newVariant('storm', 'bg/cove-storm.webm'))

  return doc
}

const FILES: MediaFile[] = [
  { path: 'sprites/wren-happy.png', bytes: 1, url: 'app://media/p/media/sprites/wren-happy.png' },
  { path: 'sprites/kael-neutral.png', bytes: 1, url: 'app://media/p/media/sprites/kael-neutral.png' },
  { path: 'bg/cove-night.png', bytes: 1, url: 'app://media/p/media/bg/cove-night.png' },
  { path: 'bg/cove-storm.webm', bytes: 1, url: 'app://media/p/media/bg/cove-storm.webm' }
]

/**
 * The scene names files as `media/<path>`; the scan reports them as `<path>`.
 * Getting that prefix wrong shows nothing at all and raises no error, so the
 * alignment is built the way the player builds it and asserted here.
 */
const urls = (files = FILES): Map<string, string> =>
  new Map(files.map((file) => [`media/${file.path}`, file.url]))

describe('Stage', () => {
  it('draws the background and the character a tag named', () => {
    const scene = sceneFrom(seeded(), [['bg:the_cove/night', 'char:wren/happy']])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(container.querySelector('.stage-bg')).toHaveAttribute(
      'src',
      'app://media/p/media/bg/cove-night.png'
    )
    expect(container.querySelector('.stage-char')).toHaveAttribute(
      'src',
      'app://media/p/media/sprites/wren-happy.png'
    )
  })

  it('draws nothing at all when the story has no media tags', () => {
    const { container } = render(<Stage scene={EMPTY_SCENE} urls={urls()} />)
    expect(container.querySelector('.stage')).toBeNull()
  })

  /**
   * A background may be a looping clip. Drawn as an <img> it is a broken icon
   * that says nothing about why, so the file decides the element.
   */
  describe('a background that is a clip', () => {
    it('plays it rather than drawing it', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/storm']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      const bg = container.querySelector('.stage-bg')
      expect(bg?.tagName).toBe('VIDEO')
      expect(bg).toHaveAttribute('src', 'app://media/p/media/bg/cove-storm.webm')
    })

    /** Looping and silent: sound in this story is what `# music:` is for. */
    it('loops it, muted, without being asked', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/storm']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      const bg = container.querySelector('.stage-bg') as HTMLVideoElement | null
      expect(bg?.autoplay).toBe(true)
      expect(bg?.loop).toBe(true)
      expect(bg?.muted).toBe(true)
    })

    it('plays once when the background tag asks and holds the final frame', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/storm once']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      const bg = container.querySelector('.stage-bg') as HTMLVideoElement | null
      expect(bg?.autoplay).toBe(true)
      expect(bg?.loop).toBe(false)
    })

    it('still draws a still one as a picture', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/night']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      expect(container.querySelector('.stage-bg')?.tagName).toBe('IMG')
    })

    it('swaps between the two as the tags change', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/night'], ['bg:the_cove/storm']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      expect(container.querySelector('.stage-bg')?.tagName).toBe('VIDEO')
    })
  })

  /**
   * A place drawn receding one way is a second place once turned, so the flip
   * has to reach the picture and not only the model of it.
   */
  describe('a background drawn the other way round', () => {
    it('mirrors a still one', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/night flipped']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      expect(container.querySelector('.stage-bg')).toHaveClass('is-flipped')
    })

    it('mirrors a clip, still playing it', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/storm flipped']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      const bg = container.querySelector('.stage-bg') as HTMLVideoElement | null
      expect(bg?.tagName).toBe('VIDEO')
      expect(bg).toHaveClass('is-flipped')
      expect(bg?.autoplay).toBe(true)
    })

    it('leaves one the tag said nothing about alone', () => {
      const scene = sceneFrom(seeded(), [['bg:the_cove/night']])
      const { container } = render(<Stage scene={scene} urls={urls()} />)

      expect(container.querySelector('.stage-bg')).not.toHaveClass('is-flipped')
    })
  })

  it('shows a character with no background rather than hiding both', () => {
    const scene = sceneFrom(seeded(), [['char:wren/happy']])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(container.querySelector('.stage-char')).toBeInTheDocument()
    expect(container.querySelector('.stage-bg')).toHaveClass('is-empty')
  })

  it('says which tag named nothing, rather than sitting blank', () => {
    const scene = sceneFrom(seeded(), [['char:nobody']])
    render(<Stage scene={scene} urls={urls()} />)

    expect(screen.getByText(/#char:nobody — not in the catalogue/)).toBeInTheDocument()
  })

  // Catalogued, but the file has been moved or deleted since — different from a
  // tag naming nothing, and worth saying differently.
  it('says when a catalogued file is missing from the folder', () => {
    const scene = sceneFrom(seeded(), [['char:wren/happy']])
    render(<Stage scene={scene} urls={new Map()} />)

    expect(screen.getByText(/missing from the folder/)).toBeInTheDocument()
  })

  it('keeps the background up while the character changes', () => {
    const doc = seeded()
    const scene = sceneFrom(doc, [['bg:the_cove/night'], [], ['char:wren/happy'], []])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(container.querySelector('.stage-bg')).toHaveAttribute(
      'src',
      'app://media/p/media/bg/cove-night.png'
    )
    expect(container.querySelector('.stage-char')).toBeInTheDocument()
  })
})

/**
 * Where a character is standing.
 *
 * The grammar has had three slots all along and the scene has always worked
 * out who is in which; the stage simply never read them, so everybody was
 * drawn dead centre and two people on screen stacked into one. A tag that says
 * left and draws middle is worse than no tag at all — it looks like the tag
 * was understood.
 */
describe('where a character stands', () => {
  const slotOf = (container: HTMLElement, at: number): string =>
    container.querySelectorAll('.stage-char')[at]!.className

  it('puts somebody in the middle when the tag did not say', () => {
    const scene = sceneFrom(seeded(), [['char:wren/happy']])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    // The grammar's own default, not a fallback invented by the drawing.
    expect(slotOf(container, 0)).toContain('is-middle')
  })

  it('puts them where the tag says', () => {
    const scene = sceneFrom(seeded(), [['show:wren/happy at left']])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(slotOf(container, 0)).toContain('is-left')
  })

  it('draws two characters in different places rather than on top of each other', () => {
    const scene = sceneFrom(seeded(), [['show:wren/happy at left', 'show:kael/neutral at right']])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(container.querySelectorAll('.stage-char')).toHaveLength(2)
    expect(slotOf(container, 0)).toContain('is-left')
    expect(slotOf(container, 1)).toContain('is-right')
  })

  it('leaves somebody standing where they were when a later tag says nothing', () => {
    // The tags stick until changed, so re-showing a variant must not walk them
    // back to the middle.
    const scene = sceneFrom(seeded(), [['show:wren/happy at right'], ['char:wren/happy']])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(slotOf(container, 0)).toContain('is-right')
  })

  it('forgets where they stood once they leave', () => {
    const scene = sceneFrom(seeded(), [
      ['show:wren/happy at left'],
      ['hide:wren'],
      ['char:wren/happy']
    ])
    const { container } = render(<Stage scene={scene} urls={urls()} />)

    expect(slotOf(container, 0)).toContain('is-middle')
  })
})
