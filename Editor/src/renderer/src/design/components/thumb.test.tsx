// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Thumb } from './data'

/**
 * A background may be a still or a looping clip, and the thumb is shown in the
 * manuscript rail and every media picker. Drawn as an <img> a clip is a broken
 * icon that says nothing about why, so the check lives in the thumb itself
 * rather than in each of the places that use one — there are six, and a rule
 * every caller has to remember is a rule one of them will not.
 */
describe('Thumb', () => {
  it('draws a picture as a picture', () => {
    const { container } = render(<Thumb src="app://media/p/media/bg/cove.png" />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'app://media/p/media/bg/cove.png')
    expect(container.querySelector('video')).toBeNull()
  })

  it('shows a clip as a clip', () => {
    const { container } = render(<Thumb src="app://media/p/media/bg/storm.webm" />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('video')).not.toBeNull()
  })

  /**
   * A <video> that has loaded only its metadata paints nothing, so every clip
   * on the panel would be a black rectangle. Seeking a little way in is what
   * draws a frame.
   */
  it('seeks a clip far enough in to have a frame to show', () => {
    const { container } = render(<Thumb src="app://media/p/media/bg/storm.webm" />)

    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      'app://media/p/media/bg/storm.webm#t=0.1'
    )
  })

  /** Not playing: a panel of them all looping at once is a lot of decoding. */
  it('does not play it', () => {
    const { container } = render(<Thumb src="app://media/p/media/bg/storm.webm" />)
    const video = container.querySelector('video') as HTMLVideoElement

    expect(video.autoplay).toBe(false)
    expect(video.muted).toBe(true)
  })

  it('says a missing clip is missing rather than showing a blank frame', () => {
    const { container } = render(<Thumb src="app://media/p/media/bg/storm.webm" missing />)

    expect(container.querySelector('video')).toBeNull()
    expect(container.textContent).toContain('missing')
  })
})
