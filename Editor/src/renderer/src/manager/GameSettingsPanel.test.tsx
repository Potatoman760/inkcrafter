// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyGame, type GameDocument } from '@shared/bundle/gameDoc'
import type { Project } from '@shared/project'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import { GameSettingsPanel } from './GameSettingsPanel'
import { installApi } from '../../../test/harness'

/**
 * The launch menu's picture.
 *
 * The first setting in the app that no tag can reach — the reader sees it
 * before a line of ink has run — so the only way to get it wrong is to point it
 * at something that is not there, which is what these are about.
 */

function seeded(): MediaDocument {
  let doc = emptyMedia()

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('day', 'bg/cove-day.png'))
  doc = addVariant(doc, cove.id, newVariant('clip', 'bg/cove.webm'))

  // A character, to prove only backgrounds are offered.
  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  return addVariant(doc, wren.id, newVariant('happy', 'sprites/wren.png'))
}

const PROJECT: Project = {
  id: 'prj_fonttest00',
  title: 'Breedhaven',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: 'C:/projects/breedhaven'
}

function panel(doc: GameDocument = emptyGame(), media = seeded(), project: Project | null = PROJECT) {
  const onChange = vi.fn()

  render(
    <GameSettingsPanel
      doc={doc}
      project={project}
      projectTitle="Breedhaven"
      media={media}
      files={[{ path: 'bg/cove-day.png', bytes: 1, url: 'app://media/p/media/bg/cove-day.png' }]}
      saving={false}
      error={null}
      onChange={onChange}
    />
  )

  return { onChange }
}

const options = (name: string): string[] =>
  Array.from(screen.getByRole('combobox', { name }).querySelectorAll('option')).map(
    (one) => one.textContent ?? ''
  )

describe('GameSettingsPanel', () => {
  beforeEach(() => {
    installApi()
  })

  it('toggles the one-time adult declaration without disturbing other launch settings', async () => {
    const { onChange } = panel()
    const confirmation = screen.getByRole('checkbox', { name: 'Require 18+ confirmation' })

    expect(confirmation).toBeChecked()
    await userEvent.click(confirmation)

    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      requireAdultConfirmation: false
    })
  })

  it('configures separate names and independent dialogue typography', async () => {
    const { onChange } = panel()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Separate Name: prefixes' }))
    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      dialogue: { ...emptyGame().dialogue, separateNames: true }
    })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dialogue font' }), 'serif')
    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      dialogue: {
        ...emptyGame().dialogue,
        text: { ...emptyGame().dialogue.text, font: 'serif' }
      }
    })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Name font' }), 'fantasy')
    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      dialogue: {
        ...emptyGame().dialogue,
        name: { ...emptyGame().dialogue.name, font: 'fantasy' }
      }
    })
    expect(screen.getByRole('spinbutton', { name: 'Dialogue size' })).toHaveValue(23)
    expect(screen.getByRole('spinbutton', { name: 'Name size' })).toHaveValue(24)
  })

  it('imports a custom font into the project and selects it for dialogue', async () => {
    const api = installApi({
      game: {
        importFont: vi.fn(async () => ({
          ok: true,
          cancelled: false,
          file: 'fonts/Atkinson-Hyperlegible.woff2',
          message: ''
        }))
      }
    })
    const { onChange } = panel()

    await userEvent.click(screen.getAllByRole('button', { name: 'Upload' })[0]!)

    expect(api.game.importFont).toHaveBeenCalledWith(PROJECT)
    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      dialogue: {
        ...emptyGame().dialogue,
        text: {
          ...emptyGame().dialogue.text,
          font: 'custom',
          file: 'fonts/Atkinson-Hyperlegible.woff2'
        }
      }
    })
  })

  it('offers only cross-platform generic built-in families', () => {
    panel()

    expect(options('Dialogue font')).toEqual([
      'System sans', 'Sans serif', 'Serif', 'Monospace', 'Cursive', 'Display'
    ])
  })

  it('selects a catalogued image as the desktop icon', async () => {
    const media = seeded()
    const cove = media.assets.find((one) => one.name === 'the_cove')!
    const { onChange } = panel(emptyGame(), media)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Desktop icon' }),
      `media:${cove.id}:${cove.variants[0]!.id}`
    )

    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      desktopIcon: {
        kind: 'media',
        ref: { assetId: cove.id, variantId: cove.variants[0]!.id }
      }
    })
  })

  it('uploads and selects a project-owned desktop icon', async () => {
    const api = installApi({
      game: {
        icons: vi.fn(async () => []),
        importIcon: vi.fn(async () => ({
          ok: true,
          cancelled: false,
          file: 'icons/game.png',
          url: 'app://media/projects/breedhaven/icons/game.png',
          message: ''
        }))
      }
    })
    const { onChange } = panel()
    const field = screen.getByText('Desktop icon').closest<HTMLElement>('.ic-field')!

    await userEvent.click(within(field).getByRole('button', { name: 'Upload' }))

    expect(api.game.importIcon).toHaveBeenCalledWith(PROJECT)
    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      desktopIcon: { kind: 'file', file: 'icons/game.png' }
    })
    expect(within(field).getByRole('option', { name: 'game.png' })).toBeInTheDocument()
  })

  it('previews a previously uploaded desktop icon', async () => {
    installApi({
      game: {
        icons: vi.fn(async () => [{
          file: 'icons/game.png',
          url: 'app://media/projects/breedhaven/icons/game.png'
        }])
      }
    })
    panel({
      ...emptyGame(),
      desktopIcon: { kind: 'file', file: 'icons/game.png' }
    })

    expect(await screen.findByAltText('Desktop icon preview')).toHaveAttribute(
      'src',
      'app://media/projects/breedhaven/icons/game.png'
    )
  })

  it('keeps font sizing compact and labels its unit beside the input', () => {
    const { container } = render(
      <GameSettingsPanel
        doc={emptyGame()}
        project={PROJECT}
        projectTitle="Breedhaven"
        media={seeded()}
        files={[]}
        saving={false}
        error={null}
        onChange={vi.fn()}
      />
    )

    expect(container.querySelectorAll('.game-settings__font-upload')).toHaveLength(2)
    expect(screen.queryByText('Pixels.')).not.toBeInTheDocument()
    expect(screen.getAllByText('px')).toHaveLength(2)
    expect(container.querySelectorAll('.game-settings__font-size-input')).toHaveLength(2)
  })

  it('edits the player-facing version without disturbing other launch settings', async () => {
    const { onChange } = panel()

    await userEvent.type(screen.getByLabelText('Game version'), 'v1.2.3')

    expect(onChange).toHaveBeenLastCalledWith({ ...emptyGame(), releaseVersion: '3' })
    expect(screen.getByLabelText('Game version')).toHaveAttribute('maxlength', '32')
  })

  it('offers still backgrounds, and nothing else', async () => {
    panel()

    await userEvent.click(screen.getByRole('combobox', { name: 'Startup background' }))

    expect(within(screen.getByRole('listbox')).getAllByRole('option').map(
      (option) => option.textContent
    )).toEqual([
      '(plain colour)', 'The Cove — day'
    ])
  })

  it('chooses one, as a reference rather than a path', async () => {
    const media = seeded()
    const { onChange } = panel(emptyGame(), media)

    const cove = media.assets.find((one) => one.name === 'the_cove')!
    await userEvent.click(screen.getByRole('combobox', { name: 'Startup background' }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', {
      name: 'The Cove — day'
    }))

    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      startupBackground: { assetId: cove.id, variantId: cove.variants[0]!.id }
    })
  })

  it('goes back to the plain colour', async () => {
    const media = seeded()
    const cove = media.assets.find((one) => one.name === 'the_cove')!
    const { onChange } = panel(
      { ...emptyGame(), startupBackground: { assetId: cove.id, variantId: cove.variants[0]!.id } },
      media
    )

    await userEvent.click(screen.getByRole('combobox', { name: 'Startup background' }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', {
      name: '(plain colour)'
    }))

    expect(onChange).toHaveBeenCalledWith({ ...emptyGame(), startupBackground: null })
  })

  it('previews a background while its option is hovered', async () => {
    panel()

    await userEvent.click(screen.getByRole('combobox', { name: 'Startup background' }))
    await userEvent.hover(within(screen.getByRole('listbox')).getByRole('option', {
      name: 'The Cove — day'
    }))

    expect(screen.getByAltText('The Cove — day preview')).toHaveAttribute(
      'src',
      'app://media/p/media/bg/cove-day.png'
    )
  })

  // The picture can be deleted from the catalogue long after it was chosen, and
  // the menu would fall back to its colour without ever saying why.
  it('says so when the chosen picture is gone', () => {
    panel({ ...emptyGame(), startupBackground: { assetId: 'med_gone', variantId: 'med_gone' } })

    expect(screen.getByText(/no longer in the catalogue/)).toBeInTheDocument()
  })

  it('offers the project title as what a blank field means', () => {
    panel()

    expect(screen.getByLabelText('Title text')).toHaveAttribute('placeholder', 'Breedhaven')
    expect(screen.getByLabelText('Title text')).toHaveValue('')
  })

  it('carries the colour and size the menu used to hard-code', () => {
    panel()

    expect(screen.getByLabelText('Title colour, as hex')).toHaveValue('#ffd98a')
    expect(screen.getByLabelText('Title size')).toHaveValue(64)
  })

  it('changes the title without disturbing the rest of it', async () => {
    const { onChange } = panel()

    await userEvent.type(screen.getByLabelText('Title text'), 'B')

    expect(onChange).toHaveBeenCalledWith({
      ...emptyGame(),
      title: { ...emptyGame().title, text: 'B' }
    })
  })

  // A wordmark is a picture of a name; no size or colour turns one into the
  // other, so it replaces the text rather than joining it.
  it('says the text settings stop applying once a graphic is chosen', async () => {
    const media = seeded()
    const cove = media.assets.find((one) => one.name === 'the_cove')!

    expect(screen.queryByText(/not drawn while this is set/)).not.toBeInTheDocument()

    panel(
      {
        ...emptyGame(),
        title: {
          ...emptyGame().title,
          art: { assetId: cove.id, variantId: cove.variants[0]!.id }
        }
      },
      media
    )

    expect(screen.getByText(/not drawn while this is set/)).toBeInTheDocument()
  })

  it('says there is nothing to choose when no backgrounds exist', () => {
    panel(emptyGame(), emptyMedia())

    expect(screen.getByText('No backgrounds catalogued yet.')).toBeInTheDocument()
  })
})
