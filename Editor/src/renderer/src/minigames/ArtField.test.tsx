// @vitest-environment jsdom
import { describe, expect, it, vi, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import { installApi } from '../../../test/harness'
import { ArtField, type ArtHome, type ArtOption } from './ArtField'

/**
 * One picture slot.
 *
 * Choosing is the easy half. The half worth testing is bringing a picture in
 * from the slot itself: it has to change the catalogue and the slot in one
 * step, file the picture somewhere sensible, and do nothing at all when the
 * author closes the dialog.
 */

const project: Project = {
  id: 'prj_2n8v5h1t6w',
  title: 'Breedhaven',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  path: 'C:/projects/breedhaven',
  bundleOut: null
}

/** A catalogue with one background asset holding one look. */
function seeded() {
  const asset = newAsset('Villa interiors', 'background')
  const garden = newVariant('garden', 'backgrounds/villa_interiors/garden.png')
  const media = addVariant(addAsset(emptyMedia(), asset), asset.id, garden)
  const ref = { assetId: asset.id, variantId: garden.id }
  const options: ArtOption[] = [{ ref, label: 'Villa interiors — garden', url: 'app://garden.png' }]
  return { media, asset, garden, ref, options }
}

type Spied = ArtHome & { onMediaChange: Mock<(next: MediaDocument) => void>; onImported: Mock<() => void> }

function homeFor(media: MediaDocument): Spied {
  return {
    project,
    media,
    kind: 'background',
    asset: 'consort_villa',
    display: 'Consort villa',
    onMediaChange: vi.fn<(next: MediaDocument) => void>(),
    onImported: vi.fn<() => void>()
  }
}

/** Main's answer when the author picks a file and the copy succeeds. */
function imported(file: string) {
  return installApi({
    media: {
      importLook: vi.fn(async () => ({ ok: true, cancelled: false, file, moved: [], message: '' }))
    }
  })
}

describe('ArtField', () => {
  it('chooses a look from the catalogue, shows it, and clears it', async () => {
    const { options, ref } = seeded()
    const onChange = vi.fn()
    const { rerender } = render(
      <ArtField label="Notice board" value={null} options={options} shape="wide" onChange={onChange} />
    )

    await userEvent.selectOptions(screen.getByLabelText('Notice board'), `${ref.assetId}:${ref.variantId}`)
    expect(onChange).toHaveBeenLastCalledWith(ref)

    rerender(<ArtField label="Notice board" value={ref} options={options} shape="wide" onChange={onChange} />)
    expect(screen.getByAltText('Notice board preview')).toHaveAttribute('src', 'app://garden.png')

    await userEvent.selectOptions(screen.getByLabelText('Notice board'), '')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  // The preview is the shape the player draws: a plan at its own proportions
  // rather than cropped to 16:9, and a sprite whole.
  it('previews a plan at its own proportions and a sprite whole', () => {
    const { options, ref } = seeded()
    const { rerender } = render(
      <ArtField label="Floor plan" value={ref} options={options} shape={{ width: 1672, height: 941 }} onChange={vi.fn()} />
    )
    const plan = screen.getByAltText('Floor plan preview').parentElement!
    expect(plan).toHaveClass('art-field__preview--plan')
    expect(plan.style.getPropertyValue('--art-aspect')).toBe('1672 / 941')

    rerender(<ArtField label="Catcher" value={ref} options={options} shape="sprite" onChange={vi.fn()} />)
    expect(screen.getByAltText('Catcher preview').parentElement).toHaveClass('art-field__preview--whole')
  })

  it('says when the chosen look has left the catalogue, without clearing it', () => {
    const { options } = seeded()
    const { container } = render(
      <ArtField label="Notice board" value={{ assetId: 'gone', variantId: 'gone' }} options={options} shape="wide" onChange={vi.fn()} />
    )

    expect(screen.getByRole('option', { name: 'Missing picture', selected: true })).toBeInTheDocument()
    expect(container.querySelector('.ic-thumb.is-missing')).not.toBeNull()
  })

  it('offers no upload without somewhere to file it', () => {
    const { options } = seeded()
    render(<ArtField label="Notice board" value={null} options={options} shape="wide" onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Upload for Notice board' })).toBeNull()
  })

  it('uploads into an asset named after the minigame, made on first use, and chooses it', async () => {
    const api = imported('backgrounds/consort_villa/notice_board.png')
    const home = homeFor(emptyMedia())
    const onChange = vi.fn()
    render(
      <ArtField label="Notice board" value={null} options={[]} shape="wide" home={home} look="notice board" onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Upload for Notice board' }))

    expect(api.media.importLook).toHaveBeenCalledWith(project, {
      kind: 'background',
      asset: 'consort_villa',
      look: 'notice_board',
      gather: []
    })
    const next = home.onMediaChange.mock.calls[0]![0] as MediaDocument
    const asset = next.assets[0]!
    expect(asset).toMatchObject({ kind: 'background', name: 'consort_villa', display: 'Consort villa' })
    expect(asset.variants).toEqual([
      expect.objectContaining({ name: 'notice_board', file: 'backgrounds/consort_villa/notice_board.png' })
    ])
    expect(onChange).toHaveBeenCalledWith({ assetId: asset.id, variantId: asset.variants[0]!.id })
    expect(home.onImported).toHaveBeenCalled()
  })

  // A second upload into a slot is a second picture; replacing the first is
  // the other button.
  it('adds to the asset once it exists, under the next free name', async () => {
    imported('backgrounds/consort_villa/garden-2.png')
    const asset = newAsset('consort_villa', 'background')
    const first = newVariant('garden', 'backgrounds/consort_villa/garden.png')
    const home = homeFor(addVariant(addAsset(emptyMedia(), asset), asset.id, first))
    render(
      <ArtField label="Room background" value={null} options={[]} shape="wide" home={home} look="Garden" onChange={vi.fn()} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Upload for Room background' }))

    const next = home.onMediaChange.mock.calls[0]![0] as MediaDocument
    expect(next.assets).toHaveLength(1)
    expect(next.assets[0]!.variants.map((one) => one.name)).toEqual(['garden', 'garden_2'])
  })

  it('replaces the chosen look where it is filed, and leaves the slot pointing at it', async () => {
    const api = imported('backgrounds/villa_interiors/garden-2.png')
    const { media, garden, ref, options } = seeded()
    const home = homeFor(media)
    const onChange = vi.fn()
    render(
      <ArtField label="Room background" value={ref} options={options} shape="wide" home={home} onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Replace Room background' }))

    // Filed under the look's own asset, not the minigame's: it is that look
    // that changes, wherever else the story shows it.
    expect(api.media.importLook).toHaveBeenCalledWith(project, {
      kind: 'background',
      asset: 'villa_interiors',
      look: 'garden',
      gather: ['backgrounds/villa_interiors/garden.png']
    })
    const next = home.onMediaChange.mock.calls[0]![0] as MediaDocument
    expect(next.assets[0]!.variants[0]).toMatchObject({
      id: garden.id,
      file: 'backgrounds/villa_interiors/garden-2.png'
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('changes nothing when the dialog is closed, and says why when the copy fails', async () => {
    installApi({})
    const home = homeFor(emptyMedia())
    const onChange = vi.fn()
    const { unmount } = render(
      <ArtField label="Notice board" value={null} options={[]} shape="wide" home={home} onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Upload for Notice board' }))
    expect(home.onMediaChange).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    unmount()

    installApi({
      media: {
        importLook: vi.fn(async () => ({ ok: false, cancelled: false, file: null, moved: [], message: 'That file is empty.' }))
      }
    })
    render(<ArtField label="Notice board" value={null} options={[]} shape="wide" home={home} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Upload for Notice board' }))
    expect(screen.getByText('That file is empty.')).toBeInTheDocument()
    expect(home.onMediaChange).not.toHaveBeenCalled()
  })
})
