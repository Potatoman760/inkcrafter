// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyGallery } from '@shared/bundle/galleryDoc'
import { newAsset, newVariant, type MediaDocument } from '@shared/mediaDoc'
import { GalleryPanel } from './GalleryPanel'

const background = {
  ...newAsset('Moonlit bath', 'background'),
  id: 'med_background',
  tags: ['romance', 'night'],
  variants: [{ ...newVariant('night', 'backgrounds/bath/night.png'), id: 'med_night' }]
}
const character = {
  ...newAsset('Seraphine', 'character'),
  id: 'med_seraphine',
  variants: [{ ...newVariant('portrait', 'characters/seraphine/portrait.png'), id: 'med_portrait' }]
}
const media: MediaDocument = { version: 1, assets: [background, character] }

describe('GalleryPanel', () => {
  it('creates a group with selector shape, cover and unlockable scenes', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <GalleryPanel doc={emptyGallery()} media={media} files={[]} saving={false} error={null} onChange={onChange} />
    )
    await userEvent.type(screen.getByLabelText('New gallery group'), 'Seraphine')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    const withGroup = onChange.mock.calls[0]![0]
    expect(withGroup.groups[0].name).toBe('Seraphine')
    rerender(<GalleryPanel doc={withGroup} media={media} files={[]} saving={false} error={null} onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: '16:9 landscape' }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Selector picture/ }),
      'med_seraphine:med_portrait'
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /Moonlit bath/ }))

    expect(onChange.mock.calls.at(-1)![0].groups[0].items).toHaveLength(1)
    expect(screen.queryByRole('checkbox', { name: /Seraphine/ })).not.toBeInTheDocument()
  })

  // The panel used to add a group called "New gallery" from a header button, so
  // an empty name was not a state it could be in.
  it('will not add a group without a name', async () => {
    const onChange = vi.fn()
    render(
      <GalleryPanel doc={emptyGallery()} media={media} files={[]} saving={false} error={null} onChange={onChange} />
    )

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('New gallery group'), '   ')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('filters a large scene selection list by text and media tags', async () => {
    const group = { ...emptyGallery(), groups: [{
      id: 'med_group', name: 'Seraphine', aspect: '9:16' as const, cover: null, items: []
    }] }
    render(<GalleryPanel doc={group} media={media} files={[]} saving={false} error={null} onChange={vi.fn()} />)

    const filter = screen.getByRole('searchbox', { name: 'Filter gallery scenes' })
    expect(screen.getByRole('checkbox', { name: /Moonlit bath/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1')

    await userEvent.type(filter, 'forest')
    expect(screen.queryByRole('checkbox', { name: /Moonlit bath/ })).not.toBeInTheDocument()
    expect(screen.getByText('No scenes match “forest”.')).toBeInTheDocument()

    await userEvent.clear(filter)
    await userEvent.type(filter, 'romance night')
    expect(screen.getByRole('checkbox', { name: /Moonlit bath/ })).toBeInTheDocument()
  })

  it('uses the result trail to preview media instead of repeating its kind', async () => {
    const group = { ...emptyGallery(), groups: [{
      id: 'med_group', name: 'Seraphine', aspect: '9:16' as const, cover: null, items: []
    }] }
    render(
      <GalleryPanel
        doc={group}
        media={media}
        files={[{ path: 'backgrounds/bath/night.png', bytes: 42, url: 'app://bath-night.png' }]}
        saving={false}
        error={null}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('background')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview Moonlit bath — night' }))
    const dialog = screen.getByRole('dialog', { name: 'Preview of backgrounds/bath/night.png' })
    expect(dialog).toHaveClass('media-preview')
    expect(screen.getByAltText('backgrounds/bath/night.png')).toHaveAttribute(
      'src',
      'app://bath-night.png'
    )
  })

  it('opens portrait video in the fitted media lightbox', async () => {
    const animation = {
      ...newAsset('Seraphine dance', 'animation'),
      id: 'med_dance',
      variants: [{ ...newVariant('portrait', 'animations/seraphine/dance.webm'), id: 'med_dance_portrait' }]
    }
    const portraitMedia: MediaDocument = { version: 1, assets: [animation] }
    const group = { ...emptyGallery(), groups: [{
      id: 'med_group', name: 'Seraphine', aspect: '9:16' as const, cover: null, items: []
    }] }
    const { container } = render(
      <GalleryPanel
        doc={group}
        media={portraitMedia}
        files={[{ path: 'animations/seraphine/dance.webm', bytes: 420, url: 'app://dance.webm' }]}
        saving={false}
        error={null}
        onChange={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Preview Seraphine dance — portrait' }))

    const dialog = screen.getByRole('dialog', { name: 'Preview of animations/seraphine/dance.webm' })
    expect(dialog).toHaveClass('media-preview')
    expect(container.querySelector('.media-preview__stage video')).toHaveAttribute(
      'src',
      'app://dance.webm'
    )
  })
})
