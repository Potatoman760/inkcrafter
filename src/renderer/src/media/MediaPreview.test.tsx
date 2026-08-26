// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaPreview, type PreviewItem } from './MediaPreview'

/**
 * The lightbox.
 *
 * The two things worth pinning down are that a clip is played rather than
 * drawn — an <img> pointed at an .mp4 fails silently — and that a look naming
 * a file the folder does not have says so, since that is the state the
 * catalogue is most often in while it is being built.
 */

const LOOKS: PreviewItem[] = [
  { file: 'sprites/wren-neutral.png', url: 'app://media/p/media/sprites/wren-neutral.png', label: 'Wren', look: 'neutral', bytes: 24_576 },
  { file: 'sprites/wren-happy.png', url: 'app://media/p/media/sprites/wren-happy.png', label: 'Wren', look: 'happy' },
  { file: 'sprites/wren-wary.png', url: 'app://media/p/media/sprites/wren-wary.png', label: 'Wren', look: 'wary' }
]

function preview(items = LOOKS, at = 0) {
  const onMove = vi.fn()
  const onClose = vi.fn()
  const view = render(<MediaPreview items={items} at={at} onMove={onMove} onClose={onClose} />)
  return { onMove, onClose, view }
}

describe('MediaPreview', () => {
  it('names the asset and the look, and the file under it', () => {
    preview()

    expect(screen.getByText('Wren · neutral')).toBeInTheDocument()
    expect(screen.getByText(/sprites\/wren-neutral\.png/)).toBeInTheDocument()
  })

  it('says how big the file is once the browser has it', () => {
    preview()
    const picture = screen.getByAltText('sprites/wren-neutral.png')

    // jsdom loads nothing, so the dimensions arrive the way they really do.
    Object.defineProperty(picture, 'naturalWidth', { value: 90, configurable: true })
    Object.defineProperty(picture, 'naturalHeight', { value: 120, configurable: true })
    fireEvent.load(picture)

    expect(screen.getByText(/90×120/)).toBeInTheDocument()
    expect(screen.getByText(/24 KB/)).toBeInTheDocument()
  })

  it('steps with the arrow keys', async () => {
    const { onMove } = preview(LOOKS, 1)

    await userEvent.keyboard('{ArrowRight}')
    expect(onMove).toHaveBeenCalledWith(2)

    await userEvent.keyboard('{ArrowLeft}')
    expect(onMove).toHaveBeenCalledWith(0)
  })

  it('stops at both ends rather than wrapping round', async () => {
    const { onMove } = preview(LOOKS, 0)
    await userEvent.keyboard('{ArrowLeft}')
    expect(onMove).not.toHaveBeenCalled()

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('says where it is in the set', () => {
    preview(LOOKS, 1)
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('offers no stepping for a single picture', () => {
    preview([LOOKS[0]!])
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('plays a clip rather than trying to draw it', () => {
    const { view } = preview([
      { file: 'clips/storm.mp4', url: 'app://media/p/media/clips/storm.mp4', label: 'The storm' }
    ])

    // An <img> pointed at an .mp4 renders as a broken icon and explains nothing.
    const video = view.container.querySelector('video')
    expect(video).toHaveAttribute('src', 'app://media/p/media/clips/storm.mp4')
    expect(video).toHaveAttribute('controls')
    expect(view.container.querySelector('img')).toBeNull()
  })

  it('says a missing file is missing instead of showing a broken picture', () => {
    const { view } = preview([{ file: 'bg/gone.png', label: 'Harbour', look: 'dusk' }])

    expect(screen.getByText(/is not in the project's media\/ folder/)).toBeInTheDocument()
    expect(view.container.querySelector('img')).toBeNull()
  })

  it('closes on Escape', async () => {
    const { onClose } = preview()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing rather than throwing when the index has run off the end', () => {
    // Deleting the last look while its preview is open.
    const { view } = preview(LOOKS, 9)
    expect(view.container.querySelector('.media-preview')).toBeNull()
  })
})
