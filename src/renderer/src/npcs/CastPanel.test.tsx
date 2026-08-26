// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyNpcs, npcVar, type Npc, type NpcDocument } from '@shared/bundle/npcDoc'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import { CastPanel } from './CastPanel'

const FILES: MediaFile[] = [
  { path: 'sprites/abeline.png', bytes: 1, url: 'app://media/p/media/sprites/abeline.png' },
  { path: 'sprites/abeline-warm.png', bytes: 1, url: 'app://media/p/media/sprites/abeline-warm.png' }
]

/** A character asset for someone, with one look, the way the screen makes one. */
function withSprite(name: string, file = FILES[0]!.path): MediaDocument {
  const asset = { ...newAsset(name, 'character'), name }
  return addVariant(addAsset(emptyMedia(), asset), asset.id, newVariant('neutral', file))
}

/**
 * What this screen must not lose.
 *
 * The cast editor is about to be rebuilt into the design system's master–detail
 * shape, and it had no tests at all. These pin the behaviour that is easy to
 * drop in a restructure and expensive to notice afterwards: the three kinds of
 * attribute are three kinds for a reason, the ink variable name shown beside a
 * row is derived rather than stored, and deleting someone asks first because
 * their variables go with them.
 *
 * Written against the current screen, so they should survive the rebuild
 * wherever the rebuild is honest.
 */

function someone(over: Partial<Npc> = {}): Npc {
  return {
    id: 'npc_1',
    inkId: 'abeline',
    name: 'Abeline',
    sprite: '',
    stats: [],
    statuses: [],
    flags: [],
    ...over
  }
}

function seeded(npcs: Npc[] = [someone()]): NpcDocument {
  return { ...emptyNpcs(), npcs }
}

/** Controlled by the test, for asserting exactly what onChange was handed. */
function panel(doc = seeded(), media: MediaDocument = emptyMedia()): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(
    <CastPanel
      doc={doc}
      saving={false}
      error={null}
      media={media}
      files={FILES}
      onChange={onChange}
      onMediaChange={vi.fn()}
    />
  )
  return onChange
}

/** For asserting what the *media* half was handed. */
function mediaPanel(
  doc = seeded(),
  media: MediaDocument = emptyMedia()
): { onChange: ReturnType<typeof vi.fn>; onMediaChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn()
  const onMediaChange = vi.fn()
  render(
    <CastPanel
      doc={doc}
      saving={false}
      error={null}
      media={media}
      files={FILES}
      onChange={onChange}
      onMediaChange={onMediaChange}
    />
  )
  return { onChange, onMediaChange }
}

/** Rendered against real state, for anything that types into a controlled field. */
function live(initial = seeded(), initialMedia: MediaDocument = emptyMedia()): void {
  function Host(): React.JSX.Element {
    const [doc, setDoc] = useState(initial)
    const [media, setMedia] = useState(initialMedia)
    return (
      <CastPanel
        doc={doc}
        saving={false}
        error={null}
        media={media}
        files={FILES}
        onChange={setDoc}
        onMediaChange={setMedia}
      />
    )
  }
  render(<Host />)
}

describe('CastPanel', () => {
  it('says what an empty cast would be for, naming the file it writes', () => {
    panel(emptyNpcs())
    expect(screen.getByText(/No cast yet/)).toBeInTheDocument()
    expect(screen.getByText(/Whoever you add here/)).toBeInTheDocument()
    expect(screen.getByText('ink/state.ink')).toBeInTheDocument()
  })

  it('gives each new person an ink name nothing else has claimed', async () => {
    const onChange = panel(seeded([someone({ inkId: 'someone' })]))

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    const next = onChange.mock.calls[0]![0] as NpcDocument
    expect(next.npcs.map((npc) => npc.inkId)).toEqual(['someone', 'someone_2'])
  })

  it('keeps the three kinds of attribute apart, each with its own defaults', async () => {
    live()

    await userEvent.click(screen.getByRole('button', { name: 'Add a number' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add a word' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add a yes or no' }))

    // A number carries a range, because ink cannot clamp for itself.
    expect(screen.getByDisplayValue('affection')).toBeInTheDocument()
    expect(screen.getByTitle('min')).toHaveValue(0)
    expect(screen.getByTitle('max')).toHaveValue(10)

    // A word carries the set it may hold.
    expect(screen.getByTitle('allowed values, comma separated')).toHaveValue('single, married')

    // A yes/no carries only its starting side.
    expect(screen.getByRole('checkbox', { name: /starts true/ })).not.toBeChecked()
  })

  it('numbers the second attribute rather than letting two share a key', async () => {
    live(seeded([someone({ stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 }] })]))

    await userEvent.click(screen.getByRole('button', { name: 'Add a number' }))

    expect(screen.getByDisplayValue('affection_2')).toBeInTheDocument()
  })

  it('shows the ink variable each attribute becomes, and follows a rename', async () => {
    live(seeded([someone({ flags: [{ key: 'knows', label: 'Knows', initial: false }] })]))

    expect(screen.getByText(npcVar('abeline', 'knows'))).toBeInTheDocument()

    const inkName = screen.getByDisplayValue('abeline')
    await userEvent.clear(inkName)
    await userEvent.type(inkName, 'wren')

    // Derived from the ink name, not stored beside it.
    expect(screen.getByText(npcVar('wren', 'knows'))).toBeInTheDocument()
    // The variable, not the sentence around it: the wording lives in
    // shared/copy.json and rewording it should not fail a test about renames.
    expect(screen.getByText(/wren_attribute/)).toBeInTheDocument()
  })

  it('refuses an ink name ink could not use', () => {
    live()

    // One event, as a paste is — see the keystroke note below for why typing
    // this is not the same thing.
    fireEvent.change(screen.getByDisplayValue('abeline'), { target: { value: 'The Warden!' } })

    expect(screen.getByDisplayValue('the_warden')).toBeInTheDocument()
  })

  it('drops an initial the allowed set no longer contains', () => {
    live(
      seeded([
        someone({
          statuses: [
            { key: 'status', label: 'Status', initial: 'married', values: ['single', 'married'] }
          ]
        })
      ])
    )

    fireEvent.change(screen.getByTitle('allowed values, comma separated'), {
      target: { value: 'single, engaged' }
    })

    // 'married' is gone, so the initial falls back rather than generating ink
    // the story could never set back.
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toContain('single')
    expect(options).toContain('engaged')
    expect(options).not.toContain('married')
  })

  /**
   * Two fields normalise on every keystroke, which eats the separator as it is
   * typed: `trim()` removes the space before it can become an underscore, and
   * the allowed-values split drops the trailing comma before the next word is
   * written. Both are only reachable by typing — a paste goes through in one
   * event and comes out right, which is why they have survived.
   *
   * Pinned as they are today so that fixing them shows up as a deliberate
   * change rather than an accident. `media/MediaPanel.tsx`'s `TagsField` is the
   * shape of the fix: hold the draft as text, commit on blur.
   */
  describe('known: normalising per keystroke eats the separator', () => {
    it('cannot type a space into the ink name', async () => {
      live()

      const inkName = screen.getByDisplayValue('abeline')
      await userEvent.clear(inkName)
      await userEvent.type(inkName, 'The Warden')

      expect(screen.getByDisplayValue('thewarden')).toBeInTheDocument()
    })

    it('cannot type a comma into the allowed values', async () => {
      live(
        seeded([
          someone({
            statuses: [{ key: 'status', label: 'Status', initial: 'single', values: ['single'] }]
          })
        ])
      )

      const values = screen.getByTitle('allowed values, comma separated')
      await userEvent.clear(values)
      await userEvent.type(values, 'single, engaged')

      expect(values).toHaveValue('singleengaged')
    })
  })

  it('says so when a sprite is named but not in the catalogue', () => {
    panel(seeded([someone({ sprite: 'gone' })]), withSprite('someone_else'))

    // The old sprite picker kept a dangling name as an option so it could not
    // be lost by accident. There is no picker now, so it is said in words —
    // silently minting a replacement would drop the name the ink still uses.
    expect(screen.getByText(/is not in the catalogue/)).toBeInTheDocument()
    expect(screen.getByText('gone')).toBeInTheDocument()
    expect(screen.getByText('# char: gone')).toBeInTheDocument()
  })

  it('asks before removing someone, and says what it costs in ink', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onChange = panel()

    const button = screen.getByRole('button', { name: 'Remove Abeline' })
    expect(button).toHaveClass('ic-btn--danger')
    expect(button.querySelector('[data-icon="trash-2"]')).not.toBeNull()

    await userEvent.click(button)

    expect(confirm.mock.calls[0]![0]).toMatch(/abeline_anything-style variables/)
    expect(onChange).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('removes them when the question is answered yes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onChange = panel()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Abeline' }))

    const next = onChange.mock.calls[0]![0] as NpcDocument
    expect(next.npcs).toEqual([])
    confirm.mockRestore()
  })

  it('removes one attribute without disturbing its neighbours', async () => {
    live(
      seeded([
        someone({
          stats: [
            { key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 },
            { key: 'trust', label: 'Trust', initial: 3, min: 0, max: 5 }
          ]
        })
      ])
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove affection' }))

    expect(screen.queryByDisplayValue('affection')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('trust')).toBeInTheDocument()
  })
})

/**
 * A character's sprites, which used to be a tab in the media catalogue.
 *
 * The link is one-way and by name: the cast member's `sprite` names a
 * character asset. Only this screen maintains it, so these pin what it does
 * when someone has one, when they have none, and when they are deleted.
 */
describe('CastPanel — looks', () => {
  it('edits a character’s looks here rather than in the media catalogue', () => {
    panel(seeded([someone({ sprite: 'abeline' })]), withSprite('abeline'))

    expect(screen.getByLabelText('Name of look 1')).toHaveValue('neutral')
    expect(screen.getByLabelText('File for look 1')).toHaveValue('sprites/abeline.png')
    expect(screen.getByText('#char:abeline/neutral')).toBeInTheDocument()
  })

  it('offers a look to someone who has none, rather than an empty list', () => {
    panel()

    expect(screen.getByText(/need not appear/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Give them a look/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('File for the new look')).not.toBeInTheDocument()
  })

  it('names a new sprite after their ink name, and points them at it', async () => {
    const { onChange, onMediaChange } = mediaPanel(seeded([someone({ inkId: 'abeline' })]))

    await userEvent.click(screen.getByRole('button', { name: /Give them a look/ }))

    const media = onMediaChange.mock.calls.at(-1)![0] as MediaDocument
    expect(media.assets).toHaveLength(1)
    expect(media.assets[0]).toMatchObject({ kind: 'character', name: 'abeline' })

    // And the cast member now points at it, which is what makes the tag work.
    expect((onChange.mock.calls.at(-1)![0] as NpcDocument).npcs[0]!.sprite).toBe('abeline')
  })

  it('does not take a sprite name another character already holds', async () => {
    const { onMediaChange } = mediaPanel(
      seeded([someone({ inkId: 'abeline', sprite: '' })]),
      withSprite('abeline')
    )

    await userEvent.click(screen.getByRole('button', { name: /Give them a look/ }))

    const media = onMediaChange.mock.calls.at(-1)![0] as MediaDocument
    expect(media.assets.map((asset) => asset.name)).toEqual(['abeline', 'abeline_2'])
  })

  it('adds a look to someone who already has one', async () => {
    live(seeded([someone({ sprite: 'abeline' })]), withSprite('abeline'))

    await userEvent.type(screen.getByLabelText('New look name'), 'warm')
    await userEvent.selectOptions(
      screen.getByLabelText('File for the new look'),
      'sprites/abeline-warm.png'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add look' }))

    expect(screen.getByText('#char:abeline/warm')).toBeInTheDocument()
  })

  it('takes their looks with them when they are removed, and says so', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onMediaChange } = mediaPanel(
      seeded([someone({ sprite: 'abeline' })]),
      withSprite('abeline')
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Abeline' }))

    expect(confirm.mock.calls[0]![0]).toMatch(/look\(s\) go too/)
    expect((onMediaChange.mock.calls.at(-1)![0] as MediaDocument).assets).toEqual([])
    confirm.mockRestore()
  })

  it('says nothing about looks when removing someone who has none', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    panel()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Abeline' }))

    expect(confirm.mock.calls[0]![0]).not.toMatch(/look/)
    confirm.mockRestore()
  })
})
