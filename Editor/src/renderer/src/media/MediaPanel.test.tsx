// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
import type { MediaFile } from '@shared/types'
import type { Project } from '@shared/project'
import { installApi } from '../../../test/harness'
import { MediaPanel } from './MediaPanel'

const FILES: MediaFile[] = [
  { path: 'bg/harbour-day.png', bytes: 100, url: 'app://media/p/media/bg/harbour-day.png' },
  { path: 'bg/harbour-dusk.png', bytes: 100, url: 'app://media/p/media/bg/harbour-dusk.png' },
  { path: 'bg/cove.png', bytes: 100, url: 'app://media/p/media/bg/cove.png' },
  { path: 'bg/unfiled.png', bytes: 100, url: 'app://media/p/media/bg/unfiled.png' }
]

const MUSIC_FILES: MediaFile[] = [
  ...FILES,
  { path: 'music/grove.mp3', bytes: 100, url: 'app://media/p/media/music/grove.mp3' },
  { path: 'music/night.ogg', bytes: 100, url: 'app://media/p/media/music/night.ogg' }
]

/**
 * Backgrounds, not characters. A character's sprites are edited in the cast now
 * — this panel has no tab for them — so the generic behaviour that used to be
 * asserted against Wren is asserted against a place instead.
 *
 * One character asset is seeded anyway, precisely because it is *not* shown: it
 * is still a kind in the catalogue, and a background must still be allowed to
 * take a name a character already holds.
 */
function seeded(): MediaDocument {
  let doc = emptyMedia()

  const harbour = newAsset('The Harbour', 'background')
  doc = addAsset(doc, harbour)
  doc = addVariant(doc, harbour.id, newVariant('day', 'bg/harbour-day.png'))
  doc = addVariant(doc, harbour.id, newVariant('dusk', 'bg/harbour-dusk.png'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('day', 'bg/cove.png'))

  doc = addAsset(doc, newAsset('Wren', 'character'))

  const grove = newAsset('The Grove', 'music')
  doc = addAsset(doc, grove)
  doc = addVariant(doc, grove.id, newVariant('loop', 'music/grove.mp3'))

  return doc
}

interface Harness {
  onChange: ReturnType<typeof vi.fn>
  onRescan: ReturnType<typeof vi.fn>
  onReveal: ReturnType<typeof vi.fn>
  onOpenUse: ReturnType<typeof vi.fn>
}

/** A picture can only be brought into a project, so the panel needs one. */
const PROJECT = { id: 'prj_0000000000', title: 'Probe', path: '/w/data/projects/p' } as Project

function dialog(doc = seeded(), files = FILES): Harness {
  const onChange = vi.fn()
  const onRescan = vi.fn()
  const onReveal = vi.fn()
  const onOpenUse = vi.fn()
  // The detail pane reads where an asset is used, so the bridge has to exist
  // even for the tests that are about something else.
  if (!('inkcrafter' in window)) installApi()

  render(
    <MediaPanel
      doc={doc}
      files={files}
      saving={false}
      error={null}
      project={PROJECT}
      onChange={onChange}
      onRescan={onRescan}
      onReveal={onReveal}
      onOpenUse={onOpenUse}
    />
  )

  return { onChange, onRescan, onReveal, onOpenUse }
}

function live(initial = seeded()): void {
  if (!('inkcrafter' in window)) installApi()

  function Host(): React.JSX.Element {
    const [doc, setDoc] = useState(initial)
    return (
      <MediaPanel
        doc={doc}
        files={FILES}
        saving={false}
        error={null}
        onChange={setDoc}
        onRescan={vi.fn()}
        onReveal={vi.fn()}
        onOpenUse={vi.fn()}
      />
    )
  }
  render(<Host />)
}

const toBackgrounds = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('tab', { name: /^Backgrounds/ }))
}

describe('MediaPanel', () => {
  it('counts each kind on its tab, and has no tab for characters', () => {
    dialog()
    // The count is its own dimmer span now, so the accessible name runs the
    // two together — the number is what this asserts either way.
    expect(screen.getByRole('tab', { name: /^Backgrounds\s*\(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Animations\s*\(0\)/ })).toBeInTheDocument()
    // One audio kind, score and cue alike: there was a Sound effects tab
    // beside this one until `# music:` learned to play once.
    expect(screen.getByRole('tab', { name: /^Music\/Sound\s*\(1\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Sound effects/ })).not.toBeInTheDocument()

    // The clips a `# play:` tag used to run are backgrounds and animations now.
    expect(screen.queryByRole('tab', { name: /Video/ })).not.toBeInTheDocument()

    // A character is edited beside the state the story tracks about them, in
    // the cast. The seeded character asset is still in the document.
    expect(screen.queryByRole('tab', { name: /Characters/ })).not.toBeInTheDocument()
    expect(screen.queryByText('wren')).not.toBeInTheDocument()
  })

  it('shows a thumbnail from the first variant', () => {
    const { container } = render(<div />)
    container.remove()

    dialog()
    // Found by its own row rather than by position: the list is sorted by name,
    // so which asset comes first is not this test's business.
    const row = [...document.querySelectorAll('.media-rows li')].find((one) =>
      one.textContent?.includes('harbour')
    )
    // Beside the row rather than inside it: the row is a button and so is the
    // thumbnail now, and one cannot be nested in the other.
    const thumb = row?.querySelector('.media-peek .media-thumb img')
    expect(thumb).toHaveAttribute('src', 'app://media/p/media/bg/harbour-day.png')
  })

  // Files arrive by being put in the folder, so what is there but unclaimed is
  // as important to show as what has been filed.
  it('lists images nobody has filed yet', () => {
    dialog()
    expect(screen.getByText(/no catalogue entry claims/)).toBeInTheDocument()
    expect(screen.getByText('bg/unfiled.png')).toBeInTheDocument()
    // Already claimed, so not offered again.
    expect(screen.queryByText('bg/cove.png')).not.toBeInTheDocument()
  })

  it('says what to do when the folder is empty', () => {
    dialog(emptyMedia(), [])
    expect(screen.getByText(/Nothing in/)).toBeInTheDocument()
  })

  it('previews the tag a new name will produce', async () => {
    dialog()
    await userEvent.type(screen.getByLabelText('New background name'), 'Idris Vale')
    expect(screen.getByText('bg:idris_vale')).toBeInTheDocument()
  })

  it('uses the bg prefix for a background', async () => {
    dialog()
    await toBackgrounds()
    await userEvent.type(screen.getByLabelText('New background name'), 'The Light')
    expect(screen.getByText('bg:the_light')).toBeInTheDocument()
  })

  it('refuses a name another asset of the same kind already has', async () => {
    dialog()
    await userEvent.type(screen.getByLabelText('New background name'), 'the_cove')

    expect(screen.getByText(/already a background called the_cove/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  // The tag carries the kind, so there is nothing to disambiguate — and the
  // character it would clash with is not even on this screen any more.
  it('lets a background take a name a character already has', async () => {
    dialog()
    await userEvent.type(screen.getByLabelText('New background name'), 'wren')

    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })

  it('shows the tag for each look', async () => {
    dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    expect(screen.getByText('#bg:the_harbour/day')).toBeInTheDocument()
    expect(screen.getByText('#bg:the_harbour/dusk')).toBeInTheDocument()
  })

  it('flags a look whose file is not in the folder', async () => {
    let doc = emptyMedia()
    const ruin = newAsset('The Ruin', 'background')
    doc = addAsset(doc, ruin)
    doc = addVariant(doc, ruin.id, newVariant('dusk', 'bg/gone.png'))

    dialog(doc)
    await userEvent.click(screen.getByText('the_ruin'))

    expect(screen.getByText('missing from media/')).toBeInTheDocument()
  })

  it('adds a look from a file in the folder', async () => {
    const { onChange } = dialog()
    // the_cove is a background, so it is on the other tab.
    await toBackgrounds()
    await userEvent.click(screen.getByText('the_cove'))

    await userEvent.type(screen.getByLabelText('New look name'), 'night')
    await userEvent.selectOptions(screen.getByLabelText('File for the new look'), 'bg/unfiled.png')
    await userEvent.click(screen.getByRole('button', { name: 'Add look' }))

    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    const cove = next.assets.find((asset) => asset.name === 'the_cove')!
    expect(cove.variants.at(-1)).toMatchObject({ name: 'night', file: 'bg/unfiled.png' })
  })

  it('offers only files nothing has claimed', async () => {
    dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    const options = Array.from(
      screen.getByLabelText('File for the new look').querySelectorAll('option')
    ).map((option) => option.value)

    expect(options).toEqual(['', 'bg/unfiled.png'])
  })

  it('repoints an existing look at another file', async () => {
    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    await userEvent.selectOptions(screen.getByLabelText('File for look 1'), 'bg/unfiled.png')

    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    const harbour = next.assets.find((asset) => asset.name === 'the_harbour')!
    expect(harbour.variants[0]).toMatchObject({ name: 'day', file: 'bg/unfiled.png' })
  })

  it('uploads a replacement file for an existing look', async () => {
    const api = installApi({
      media: {
        importLook: vi.fn(async () => ({
          ok: true,
          cancelled: false,
          file: 'backgrounds/the_harbour/day-2.png',
          moved: [],
          message: ''
        }))
      }
    })
    const { onChange, onRescan } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    await userEvent.click(screen.getByRole('button', { name: 'Upload replacement for day' }))

    expect(api.media.importLook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'background',
        asset: 'the_harbour',
        look: 'day',
        gather: ['bg/harbour-day.png', 'bg/harbour-dusk.png']
      })
    )
    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    const harbour = next.assets.find((asset) => asset.name === 'the_harbour')!
    expect(harbour.variants).toHaveLength(2)
    expect(harbour.variants[0]).toMatchObject({
      name: 'day',
      file: 'backgrounds/the_harbour/day-2.png'
    })
    expect(onRescan).toHaveBeenCalledOnce()
  })

  it('keeps a look’s own file in its list, which nothing else has claimed it from', async () => {
    dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    const options = Array.from(
      screen.getByLabelText('File for look 1').querySelectorAll('option')
    ).map((option) => option.value)

    // Its own file, plus whatever is unclaimed. Not the file the *other* look
    // uses: repointing at that would leave two looks on one picture.
    expect(options).toEqual(['bg/harbour-day.png', 'bg/unfiled.png'])
  })

  it('keeps a missing file listed rather than silently repointing the look', async () => {
    let doc = emptyMedia()
    const ruin = newAsset('The Ruin', 'background')
    doc = addAsset(doc, ruin)
    doc = addVariant(doc, ruin.id, newVariant('dusk', 'bg/gone.png'))

    dialog(doc)
    await userEvent.click(screen.getByText('the_ruin'))

    const select = screen.getByLabelText('File for look 1') as HTMLSelectElement
    expect(select.value).toBe('bg/gone.png')
    expect(screen.getByText('missing from media/')).toBeInTheDocument()
  })

  it('reorders looks, since the first is what a bare tag shows', async () => {
    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    await userEvent.click(screen.getByLabelText('Move dusk up'))

    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    expect(next.assets[0]!.variants.map((variant) => variant.name)).toEqual(['dusk', 'day'])
  })

  // Splitting on every keystroke ate the comma as it was typed, so the list
  // could never be entered at all. The text is the draft; the array is what it
  // means once you stop.
  it('lets a comma-separated tag list actually be typed', async () => {
    live()
    await userEvent.click(screen.getByText('the_harbour'))

    const box = screen.getByLabelText('Tags for the_harbour')
    await userEvent.clear(box)
    await userEvent.type(box, 'cast, act one')

    expect(box).toHaveValue('cast, act one')
  })

  it('commits the tags on blur', async () => {
    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    const box = screen.getByLabelText('Tags for the_harbour')
    await userEvent.clear(box)
    await userEvent.type(box, 'cast, act one')
    await userEvent.tab()

    expect((onChange.mock.calls.at(-1)![0] as MediaDocument).assets[0]!.tags).toEqual([
      'cast',
      'act one'
    ])
  })

  it('filters by tag as well as by name', async () => {
    let doc = seeded()
    doc = { ...doc, assets: doc.assets.map((a) => (a.name === 'the_harbour' ? { ...a, tags: ['cast'] } : a)) }

    dialog(doc)
    await userEvent.type(screen.getByLabelText('Filter'), 'cast')

    expect(screen.getByText('the_harbour')).toBeInTheDocument()
  })

  it('renames on blur, keeping the id', async () => {
    const doc = seeded()
    const id = doc.assets[0]!.id
    const { onChange } = dialog(doc)
    await userEvent.click(screen.getByText('the_harbour'))

    const name = screen.getByDisplayValue('the_harbour')
    await userEvent.clear(name)
    await userEvent.type(name, 'harbour_light')
    await userEvent.tab()

    expect((onChange.mock.calls.at(-1)![0] as MediaDocument).assets[0]).toMatchObject({
      id,
      name: 'harbour_light'
    })
  })

  it('asks before removing an asset, and says the files stay', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    const button = screen.getByRole('button', { name: 'Remove the_harbour' })
    expect(button).toHaveClass('ic-btn--danger')
    expect(button.querySelector('[data-icon="trash-2"]')).not.toBeNull()

    await userEvent.click(button)

    expect(confirm.mock.calls[0]![0]).toMatch(/files stay in media/)
    expect(onChange).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('offers a way to reach the folder and to look again', async () => {
    const { onRescan, onReveal } = dialog()

    const rescan = screen.getByRole('button', { name: 'Rescan' })
    const reveal = screen.getByRole('button', { name: 'Open folder' })
    expect(rescan).toHaveTextContent('')
    expect(reveal).toHaveTextContent('')

    await userEvent.click(rescan)
    await userEvent.click(reveal)

    expect(onRescan).toHaveBeenCalled()
    expect(onReveal).toHaveBeenCalled()
  })

  it('can permanently delete an unfiled media file after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = installApi()
    const { onRescan } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Delete bg/unfiled.png' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/cannot be undone/i))
    expect(api.media.deleteFile).toHaveBeenCalledWith(PROJECT, 'bg/unfiled.png')
    expect(onRescan).toHaveBeenCalledOnce()
    confirm.mockRestore()
  })

  /**
   * Batch work on the unfiled grid.
   *
   * An empty catalogue claims nothing, so every file in the folder is unfiled
   * and there is more than one to tick.
   */
  it('deletes every ticked file on one confirmation and one rescan', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = installApi()
    const { onRescan } = dialog(emptyMedia())

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select bg/cove.png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select bg/unfiled.png' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Delete selected/ }))

    // One prompt for the batch, naming the count rather than a path.
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0]![0]).toMatch(/2 files/)
    expect(api.media.deleteFile).toHaveBeenCalledTimes(2)
    expect(api.media.deleteFile).toHaveBeenCalledWith(PROJECT, 'bg/cove.png')
    expect(api.media.deleteFile).toHaveBeenCalledWith(PROJECT, 'bg/unfiled.png')
    // The folder is read once however many went.
    expect(onRescan).toHaveBeenCalledOnce()
    confirm.mockRestore()
  })

  it('ticks and clears the whole grid from one control', async () => {
    dialog(emptyMedia())

    const all = () => screen.getByRole('checkbox', { name: /Select all|Clear selection/ })

    await userEvent.click(all())
    expect(screen.getByText(`${FILES.length} selected`)).toBeInTheDocument()
    expect(all()).toHaveAccessibleName('Clear selection')

    await userEvent.click(all())
    expect(screen.queryByText(/selected/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete selected/ })).toBeNull()
  })

  it('carries on through a file it cannot delete, and says which', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = installApi({
      media: {
        deleteFile: vi.fn(async (_project: unknown, path: unknown) => {
          if (path === 'bg/cove.png') throw new Error('in use')
        })
      }
    })
    dialog(emptyMedia())

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select bg/cove.png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select bg/unfiled.png' }))
    await userEvent.click(screen.getByRole('button', { name: /Delete selected/ }))

    // The second one still went, and the failure is named rather than swallowed.
    expect(api.media.deleteFile).toHaveBeenCalledWith(PROJECT, 'bg/unfiled.png')
    expect(await screen.findByText(/bg\/cove\.png — in use/)).toBeInTheDocument()
    confirm.mockRestore()
  })

  it('adds a background and selects it, ready to be filled in', async () => {
    live(emptyMedia())

    await userEvent.type(screen.getByLabelText('New background name'), 'The Ridge')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByDisplayValue('the_ridge')).toBeInTheDocument()
    expect(screen.getByText(/No looks yet/)).toBeInTheDocument()
  })

  it('manages music as one file, without look names or counts', async () => {
    const { onChange } = dialog(seeded(), MUSIC_FILES)
    await userEvent.click(screen.getByRole('tab', { name: /^Music/ }))

    expect(screen.getByText('music/grove.mp3')).toBeInTheDocument()
    expect(screen.queryByText(/1 look/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('the_grove'))
    expect(screen.getByLabelText('File for the_grove')).toHaveValue('music/grove.mp3')
    expect(screen.getByText('#music:the_grove')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name of look 1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('File for look 1')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('File for the_grove'), 'music/night.ogg')
    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    const track = next.assets.find((asset) => asset.name === 'the_grove')!
    expect(track.variants).toHaveLength(1)
    expect(track.variants[0]!.file).toBe('music/night.ogg')
  })

  it('uploads music without asking for a look name', async () => {
    const api = installApi({
      media: {
        importLook: vi.fn(async () => ({
          ok: true,
          cancelled: false,
          file: 'music/the_grove/track.mp3',
          moved: [],
          message: ''
        }))
      }
    })
    const { onChange } = dialog(seeded(), MUSIC_FILES)
    await userEvent.click(screen.getByRole('tab', { name: /^Music/ }))
    await userEvent.click(screen.getByText('the_grove'))
    await userEvent.click(screen.getByRole('button', { name: 'Upload…' }))

    expect(api.media.importLook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'music', asset: 'the_grove', look: 'track' })
    )
    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    expect(next.assets.find((asset) => asset.name === 'the_grove')!.variants).toHaveLength(1)
  })

})

/**
 * A thumbnail is a fingernail. Judging a sprite means seeing it big, and the
 * question is nearly always how two looks compare — so opening one opens the
 * set it belongs to.
 */
describe('previewing', () => {
  it('opens the picture big when its thumbnail is clicked', async () => {
    dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Preview The Harbour' }))

    const preview = screen.getByRole('dialog', { name: /Preview of bg\/harbour-day\.png/ })
    expect(preview).toBeInTheDocument()
    expect(screen.getByText('The Harbour · day')).toBeInTheDocument()
  })

  // Audio has no thumbnail to judge, so the preview is the only way to hear a
  // track without leaving the app for the file manager.
  it('plays a track from its row', async () => {
    dialog(seeded(), MUSIC_FILES)
    await userEvent.click(screen.getByRole('tab', { name: /^Music/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Preview The Grove' }))

    expect(screen.getByRole('dialog', { name: /Preview of music\/grove\.mp3/ })).toBeInTheDocument()
    expect(document.querySelector('audio')).toHaveAttribute(
      'src',
      'app://media/p/media/music/grove.mp3'
    )
  })

  it('plays the chosen track from the detail pane', async () => {
    dialog(seeded(), MUSIC_FILES)
    await userEvent.click(screen.getByRole('tab', { name: /^Music/ }))
    await userEvent.click(screen.getByText('the_grove'))

    await userEvent.click(screen.getByRole('button', { name: 'Preview this track' }))

    expect(document.querySelector('audio')).toHaveAttribute(
      'src',
      'app://media/p/media/music/grove.mp3'
    )
  })

  it('has nothing to play until a file is chosen', async () => {
    let doc = seeded()
    const silent = newAsset('Silence', 'music')
    doc = addAsset(doc, silent)

    dialog(doc, MUSIC_FILES)
    await userEvent.click(screen.getByRole('tab', { name: /^Music/ }))
    await userEvent.click(screen.getByText('silence'))

    expect(screen.getByRole('button', { name: 'Preview this track' })).toBeDisabled()
  })

  it('steps through that asset’s other looks, and no one else’s', async () => {
    dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Preview The Harbour' }))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('The Harbour · dusk')).toBeInTheDocument()
  })

  it('opens a loose file from the unfiled grid, starting at the one clicked', async () => {
    dialog()

    // Nothing selected, so the detail pane is showing what is unclaimed.
    await userEvent.click(screen.getByRole('button', { name: 'Preview bg/unfiled.png' }))

    expect(screen.getByRole('dialog', { name: /Preview of bg\/unfiled\.png/ })).toBeInTheDocument()
  })

  it('closes again', async () => {
    dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Preview The Harbour' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens one look from the looks list without disturbing the row', async () => {
    dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    // The second look, from the editor rather than the list.
    await userEvent.click(screen.getByRole('button', { name: 'Preview dusk' }))

    expect(screen.getByText('The Harbour · dusk')).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })
})

/**
 * Bringing a picture in.
 *
 * The looks field could only ever file something already in the folder, which
 * meant the first step of adding art happened outside the app entirely. What
 * matters here is the second half: a picture that arrives brings the asset's
 * other looks into one folder with it, and the catalogue has to follow those
 * moves in the same change as the new look.
 */
describe('uploading a look', () => {
  it('files the copied picture under the name typed beside it', async () => {
    const api = installApi({
      media: {
        importLook: vi.fn(async () => ({
          ok: true,
          cancelled: false,
          file: 'backgrounds/the_harbour/night.png',
          moved: [],
          message: ''
        }))
      }
    })

    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))
    await userEvent.type(screen.getByLabelText('New look name'), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Upload…' }))

    expect(api.media.importLook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'background', asset: 'the_harbour', look: 'night' })
    )

    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    const harbour = next.assets.find((one) => one.name === 'the_harbour')!
    expect(harbour.variants.map((one) => one.file)).toContain('backgrounds/the_harbour/night.png')
  })

  it('follows the looks that moved, in the same change', async () => {
    installApi({
      media: {
        importLook: vi.fn(async () => ({
          ok: true,
          cancelled: false,
          file: 'backgrounds/the_harbour/night.png',
          moved: [{ from: 'bg/harbour-day.png', to: 'backgrounds/the_harbour/harbour-day.png' }],
          message: ''
        }))
      }
    })

    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))
    await userEvent.type(screen.getByLabelText('New look name'), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Upload…' }))

    // Written together: a document saved with the new look but not the moves
    // would point half this asset at files that are no longer there.
    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    const harbour = next.assets.find((one) => one.name === 'the_harbour')!
    expect(harbour.variants.map((one) => one.file)).toEqual([
      'backgrounds/the_harbour/harbour-day.png',
      'bg/harbour-dusk.png',
      'backgrounds/the_harbour/night.png'
    ])
  })

  it('changes nothing when the file dialog is closed', async () => {
    installApi({
      media: {
        importLook: vi.fn(async () => ({ ok: false, cancelled: true, file: null, moved: [], message: '' }))
      }
    })

    const { onChange } = dialog()
    await userEvent.click(screen.getByText('the_harbour'))
    await userEvent.type(screen.getByLabelText('New look name'), 'night')
    onChange.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Upload…' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('says why when it could not be brought in', async () => {
    installApi({
      media: {
        importLook: vi.fn(async () => ({
          ok: false,
          cancelled: false,
          file: null,
          moved: [],
          message: 'That is not a picture or a clip the app can show.'
        }))
      }
    })

    dialog()
    await userEvent.click(screen.getByText('the_harbour'))
    await userEvent.type(screen.getByLabelText('New look name'), 'night')
    await userEvent.click(screen.getByRole('button', { name: 'Upload…' }))

    expect(await screen.findByText(/not a picture or a clip/)).toBeInTheDocument()
  })

  it('offers nothing to upload into until the look has a name', async () => {
    dialog()
    await userEvent.click(screen.getByText('the_harbour'))

    // The name is what the file is copied in as, so it has to come first.
    expect(screen.getByRole('button', { name: 'Upload…' })).toBeDisabled()
  })
})

/**
 * Taking the white card out.
 *
 * The panel's part of it is small and easy to get wrong in a way nothing would
 * report: every look on the old file has to end up pointing at the *new* one.
 * Main deletes the original once the cutout is written, so a repoint that
 * silently did not happen leaves a look pointing at a file that is gone.
 */
describe('cutting a background out', () => {
  const cutout = (file: string): MediaDocument => {
    let doc = emptyMedia()
    const card = newAsset('The Card', 'background')
    doc = addAsset(doc, card)
    return addVariant(doc, card.id, newVariant('plate', file))
  }

  it('repoints the look at the picture that came back', async () => {
    const api = installApi({
      media: {
        cutout: vi.fn(async () => ({
          ok: true,
          file: 'bg/cove-cutout.png',
          colour: '#fbfaf7',
          cleared: 4200,
          feathered: 130,
          enclosed: 0,
          message: ''
        }))
      }
    })

    const { onChange } = dialog(cutout('bg/cove.png'))
    await userEvent.click(screen.getByText('the_card'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'From the edge' }))

    expect(api.media.cutout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ file: 'bg/cove.png', mode: 'edge' })
    )

    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    expect(next.assets[0]!.variants[0]!.file).toBe('bg/cove-cutout.png')
    expect(screen.getByText(/Took #fbfaf7 out of plate/)).toBeInTheDocument()
  })

  // Two looks can share one file, and only one of them is the look the scissors
  // were clicked on. The original does not survive the cutout, so the other has
  // to follow it too.
  it('repoints every look that shared the file, not just the one clicked', async () => {
    installApi({
      media: {
        cutout: vi.fn(async () => ({
          ok: true,
          file: 'bg/cove-cutout.png',
          colour: '#ffffff',
          cleared: 10,
          feathered: 0,
          enclosed: 0,
          message: ''
        }))
      }
    })

    let doc = cutout('bg/cove.png')
    const other = newAsset('The Other', 'background')
    doc = addAsset(doc, other)
    doc = addVariant(doc, other.id, newVariant('same', 'bg/cove.png'))

    const { onChange } = dialog(doc)
    await userEvent.click(screen.getByText('the_card'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'From the edge' }))

    const next = onChange.mock.calls.at(-1)![0] as MediaDocument
    expect(next.assets[0]!.variants[0]!.file).toBe('bg/cove-cutout.png')
    expect(next.assets[1]!.variants[0]!.file).toBe('bg/cove-cutout.png')
  })

  it('says so when the original outlived the cutout', async () => {
    installApi({
      media: {
        cutout: vi.fn(async () => ({
          ok: true,
          file: 'bg/cove-cutout.png',
          colour: '#ffffff',
          cleared: 10,
          feathered: 0,
          enclosed: 0,
          message: 'Kept bg/cove.png: it could not be deleted (EPERM).'
        }))
      }
    })

    dialog(cutout('bg/cove.png'))
    await userEvent.click(screen.getByText('the_card'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'From the edge' }))

    expect(screen.getByText(/could not be deleted \(EPERM\)/)).toBeInTheDocument()
  })

  it('says what colour the border actually was, and changes nothing', async () => {
    installApi({
      media: {
        cutout: vi.fn(async () => ({
          ok: false,
          file: null,
          colour: '#6b7a52',
          cleared: 0,
          feathered: 0,
          enclosed: 0,
          message: 'The border of this picture is #6b7a52, which is not a white background.'
        }))
      }
    })

    const { onChange } = dialog(cutout('bg/cove.png'))
    await userEvent.click(screen.getByText('the_card'))
    onChange.mockClear()
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'From the edge' }))

    expect(screen.getByText(/#6b7a52, which is not a white background/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * The second mode, and the only reason the button became a menu. `edge`
   * cannot put a hole through the art; `gaps` can, so it has to be asked for.
   */
  it('asks for gaps when that is the mode chosen', async () => {
    const api = installApi({
      media: {
        cutout: vi.fn(async () => ({
          ok: true,
          file: 'bg/cove-cutout.png',
          colour: '#fbfaf7',
          cleared: 9000,
          feathered: 300,
          enclosed: 4800,
          message: ''
        }))
      }
    })

    dialog(cutout('bg/cove.png'))
    await userEvent.click(screen.getByText('the_card'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edge, and gaps in the art' }))

    expect(api.media.cutout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'gaps' })
    )
    expect(screen.getByText(/4,800 of them were gaps the art had closed around/)).toBeInTheDocument()
  })

  it('offers both modes and nothing else, and closes without running', async () => {
    const api = installApi()

    dialog(cutout('bg/cove.png'))
    await userEvent.click(screen.getByText('the_card'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )

    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    expect(screen.getByRole('menuitem', { name: 'From the edge' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edge, and gaps in the art' })).toBeInTheDocument()

    // Clicking the scissors again is a dismissal, not a second run.
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the white background out of plate' })
    )
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(api.media.cutout).not.toHaveBeenCalled()
  })

  /** Nothing to key, and a button that did nothing would be worse than absent. */
  it('is not offered for a file that is not a PNG', async () => {
    installApi()
    dialog(cutout('bg/clip.webm'), [
      { path: 'bg/clip.webm', bytes: 100, url: 'app://media/p/media/bg/clip.webm' }
    ])
    await userEvent.click(screen.getByText('the_card'))

    expect(
      screen.queryByRole('button', { name: 'Take the white background out of plate' })
    ).not.toBeInTheDocument()
  })
})
