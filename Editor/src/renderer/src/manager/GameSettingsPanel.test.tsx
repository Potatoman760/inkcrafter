// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyGame, type GameDocument } from '@shared/bundle/gameDoc'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import { GameSettingsPanel } from './GameSettingsPanel'

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

function panel(doc: GameDocument = emptyGame(), media = seeded()) {
  const onChange = vi.fn()

  render(
    <GameSettingsPanel
      doc={doc}
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
  it('offers still backgrounds, and nothing else', () => {
    panel()

    expect(options('Startup background')).toEqual(['(plain colour)', 'The Cove — day'])
  })

  it('chooses one, as a reference rather than a path', async () => {
    const media = seeded()
    const { onChange } = panel(emptyGame(), media)

    const cove = media.assets.find((one) => one.name === 'the_cove')!
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Startup background' }),
      `${cove.id}:${cove.variants[0]!.id}`
    )

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

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Startup background' }), '')

    expect(onChange).toHaveBeenCalledWith({ ...emptyGame(), startupBackground: null })
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
