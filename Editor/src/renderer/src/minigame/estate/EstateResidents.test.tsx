// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newEstateMinigame } from '@shared/bundle/minigameDoc'
import type { EstateMinigame } from '@shared/bundle/estate'
import { EstateResidents } from './EstateResidents'

/**
 * The household, as controls.
 *
 * What matters is the cross-references: a resident's key is what her room
 * and her saved history know her by, and a scene's result is what the story
 * branches on. Both are kept consistent here rather than left for preflight.
 */

function mount(withRoommate = false) {
  const game = newEstateMinigame('Villa')
  game.residents = [
    { key: 'lira', name: 'Lira', eligibilityVariable: 'lira_is_bred', requirement: 'Finish her route', sprite: 'lira',
      scenes: [{ room: 'hall', result: 'villa_lira_welcome', title: 'Welcome' }] }
  ]
  game.rooms = game.rooms.map((room) => (room.key === 'suite_1' ? { ...room, residentKey: 'lira', beds: 1 } : room))
  if (withRoommate) {
    game.residents.push({ key: 'piri', name: 'Piri', eligibilityVariable: 'piri_is_bred', requirement: '', sprite: '', scenes: [] })
    Object.assign(game.rooms.find(room => room.key === 'suite_1')!, { companionKey: 'piri', beds: 2, inviteTogether: true })
  }
  const changed = vi.fn()
  function Host() {
    const [value, setValue] = useState(game)
    return (
      <EstateResidents
        game={value}
        flags={['lira_is_bred', 'maren_is_bred']}
        portraits={['lira', 'maren']}
        characterArt={[{ ref: { assetId: 'lira', variantId: 'bath' }, label: 'Lira bath', url: 'bath.png' }]}
        onChange={(changes) => { changed(changes); setValue((previous) => ({ ...previous, ...changes })) }}
      />
    )
  }
  render(<Host />)
  return { changed, game }
}

const last = (changed: ReturnType<typeof vi.fn>): Partial<EstateMinigame> => changed.mock.lastCall?.[0]

describe('EstateResidents', () => {
  it('assigns and clears a separate bath portrait without changing the home portrait', () => {
    const { changed } = mount()
    fireEvent.change(screen.getByLabelText('Bath sprite'), { target: { value: 'lira:bath' } })
    expect(last(changed).residents?.[0]).toMatchObject({ sprite: 'lira', bathSprite: { assetId: 'lira', variantId: 'bath' } })
    expect(screen.getByAltText('Bath sprite preview')).toHaveAttribute('src', 'bath.png')
    fireEvent.change(screen.getByLabelText('Bath visible percent'), { target: { value: '26' } })
    expect(last(changed).residents?.[0]?.bathVisiblePercent).toBe(26)
    fireEvent.change(screen.getByLabelText('Bath sprite'), { target: { value: '' } })
    expect(last(changed).residents?.[0]).toMatchObject({ sprite: 'lira', bathSprite: null })
  })
  it('keeps second-resident references in sync when renaming', () => {
    const { changed } = mount(true)
    fireEvent.change(screen.getByLabelText('Selected resident'), { target: { value: 'piri' } })
    fireEvent.change(screen.getByLabelText('Resident key'), { target: { value: 'Piri Prime' } })
    fireEvent.blur(screen.getByLabelText('Resident key'))
    expect(last(changed).rooms?.find(room => room.key === 'suite_1')).toMatchObject({ companionKey: 'piri_prime', beds: 2, inviteTogether: true })
  })
  it('edits the chosen resident\'s fields', () => {
    const { changed } = mount()

    fireEvent.change(screen.getByLabelText('Resident name'), { target: { value: 'Lira of the Fountain' } })
    fireEvent.change(screen.getByLabelText('Invitation variable'), { target: { value: 'maren_is_bred' } })
    fireEvent.change(screen.getByLabelText('Resident portrait'), { target: { value: 'maren' } })

    expect(last(changed).residents?.[0]).toMatchObject({
      key: 'lira', name: 'Lira of the Fountain', eligibilityVariable: 'maren_is_bred', sprite: 'maren'
    })
  })

  it('renames her key everywhere a room knows it, and refuses a clash', async () => {
    const { changed } = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Add resident' }))
    expect(last(changed).residents?.map((one) => one.key)).toEqual(['lira', 'resident'])

    // Back to Lira, whose suite is reserved under her old key.
    fireEvent.change(screen.getByLabelText('Selected resident'), { target: { value: 'lira' } })
    fireEvent.change(screen.getByLabelText('Resident key'), { target: { value: 'Lira Prime' } })
    fireEvent.blur(screen.getByLabelText('Resident key'))

    expect(last(changed).residents?.[0]?.key).toBe('lira_prime')
    expect(last(changed).rooms?.find((room) => room.key === 'suite_1')?.residentKey).toBe('lira_prime')

    changed.mockClear()
    fireEvent.change(screen.getByLabelText('Resident key'), { target: { value: 'resident' } })
    fireEvent.blur(screen.getByLabelText('Resident key'))
    expect(screen.getByText("resident is already someone's key.")).toBeInTheDocument()
    expect(changed).not.toHaveBeenCalled()
  })

  it('adds a scene with a result no other resident uses, and edits it', async () => {
    const { changed } = mount()

    await userEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    expect(last(changed).residents?.[0]?.scenes[1]).toEqual({ room: 'hall', title: 'A new moment', result: 'villa_lira_scene' })

    fireEvent.change(screen.getByLabelText('Scene 2 room'), { target: { value: 'garden' } })
    fireEvent.change(screen.getByLabelText('Scene 2 title'), { target: { value: 'By the fountain' } })
    fireEvent.change(screen.getByLabelText('Scene 2 result'), { target: { value: 'villa_lira_fountain' } })
    expect(last(changed).residents?.[0]?.scenes[1]).toEqual({ room: 'garden', title: 'By the fountain', result: 'villa_lira_fountain' })

    // A gate is a true/false her story sets first; clearing it leaves null, which the parser drops.
    fireEvent.change(screen.getByLabelText('Scene 2 gate'), { target: { value: 'maren_is_bred' } })
    expect(last(changed).residents?.[0]?.scenes[1]?.gate).toBe('maren_is_bred')
    fireEvent.change(screen.getByLabelText('Scene 2 gate'), { target: { value: '' } })
    expect(last(changed).residents?.[0]?.scenes[1]?.gate).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Remove scene 1' }))
    expect(last(changed).residents?.[0]?.scenes.map((scene) => scene.result)).toEqual(['villa_lira_fountain'])
  })

  // A room reserved for nobody would be a room nobody could ever live in.
  it('makes her reserved room shared again when she is removed', async () => {
    const { changed } = mount()

    await userEvent.click(screen.getByRole('button', { name: 'Remove resident' }))

    expect(last(changed).residents).toEqual([])
    expect(last(changed).rooms?.find((room) => room.key === 'suite_1')).toMatchObject({ residentKey: null, beds: 0 })
    expect(screen.getByText('Nobody can move in yet.')).toBeInTheDocument()
  })
})
