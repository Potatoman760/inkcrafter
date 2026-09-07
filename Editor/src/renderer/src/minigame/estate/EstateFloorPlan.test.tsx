// @vitest-environment jsdom
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { newEstateMinigame } from '@shared/bundle/minigameDoc'
import { EstateFloorPlan } from './EstateFloorPlan'

beforeAll(() => {
  Element.prototype.setPointerCapture = function (): void {}
  Element.prototype.releasePointerCapture = function (): void {}
})

function mount(withRoommate = false) {
  const game = newEstateMinigame('Villa')
  game.floorPlanSize = { width: 1000, height: 600 }
  game.rooms = [{ key: 'hall', name: 'Hall', cost: 0, beds: 0, requires: null, description: '', startsActive: true,
    bounds: { x: 200, y: 150, width: 200, height: 100 } }]
  game.residents = [{ key: 'lira', name: 'Lira', eligibilityVariable: 'lira_is_bred', requirement: 'Complete her route', sprite: 'lira', scenes: [] }]
  if (withRoommate) game.residents.push({ key: 'piri', name: 'Piri', eligibilityVariable: 'piri_is_bred', requirement: 'Complete her scene', sprite: '', scenes: [] })
  const changed = vi.fn()
  function Host() {
    const [value, setValue] = useState(game)
    return <EstateFloorPlan game={value} image="floor.png" flags={['lira_is_bred']} options={[
      { ref: { assetId: 'interior', variantId: 'garden' }, label: 'Fountain garden', url: 'garden.png' }
    ]} onChange={changes => {
      changed(changes); setValue(previous => ({ ...previous, ...changes }))
    }} />
  }
  const view = render(<Host />)
  const canvas = screen.getByLabelText('Villa floor plan')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 300 } as DOMRect)
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  return { ...view, changed, canvas }
}

describe('villa floor-plan authoring', () => {
  it('enables baths for shared spaces and turns them off when reserving a bedroom', () => {
    const { changed } = mount()
    fireEvent.click(screen.getByLabelText('Shared baths'))
    expect(changed.mock.lastCall?.[0].rooms[0].sharedBaths).toBe(true)
    fireEvent.change(screen.getByLabelText('Intended resident'), { target: { value: 'lira' } })
    expect(changed.mock.lastCall?.[0].rooms[0].sharedBaths).toBe(false)
    expect(screen.getByLabelText('Shared baths')).toBeDisabled()
  })
  it('edits a two-person household without offering room prerequisites', () => {
    const { changed } = mount(true)
    expect(screen.queryByRole('combobox', { name: 'Requires' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Intended resident'), { target: { value: 'lira' } })
    fireEvent.change(screen.getByLabelText('Second resident'), { target: { value: 'piri' } })
    fireEvent.click(screen.getByLabelText('Invite together'))
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ residentKey: 'lira', companionKey: 'piri', beds: 2, inviteTogether: true })
    fireEvent.change(screen.getByLabelText('Second resident'), { target: { value: '' } })
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ companionKey: null, beds: 1, inviteTogether: false })
  })
  it('sets and clears a room gate without altering its identity, restoration or art', () => {
    const { changed } = mount()
    fireEvent.change(screen.getByLabelText('Room availability variable'), { target: { value: 'lira_is_bred' } })
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ key: 'hall', startsActive: true, availabilityVariable: 'lira_is_bred' })
    fireEvent.change(screen.getByLabelText('Room availability variable'), { target: { value: '' } })
    expect(changed.mock.lastCall?.[0].rooms[0].availabilityVariable).toBeNull()
  })
  it('assigns and clears unrestored art independently of the restored interior', () => {
    const { changed } = mount()
    fireEvent.change(screen.getByLabelText('Room background'), { target: { value: 'interior:garden' } })
    fireEvent.change(screen.getByLabelText('Unrestored art'), { target: { value: 'interior:garden' } })
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ background: { assetId: 'interior', variantId: 'garden' }, unrestoredBackground: { assetId: 'interior', variantId: 'garden' } })
    expect(screen.getByAltText('Unrestored art preview')).toHaveAttribute('src', 'garden.png')
    fireEvent.change(screen.getByLabelText('Unrestored art'), { target: { value: '' } })
    expect(changed.mock.lastCall?.[0].rooms[0].unrestoredBackground).toBeNull()
    expect(screen.getByAltText('Room background preview')).toHaveAttribute('src', 'garden.png')
    expect(screen.queryByAltText('Unrestored art preview')).not.toBeInTheDocument()
  })
  it('assigns and clears an interior without changing the floor plan or resident', () => {
    const { changed } = mount()
    fireEvent.change(screen.getByLabelText('Room background'), { target: { value: 'interior:garden' } })
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ key: 'hall', background: { assetId: 'interior', variantId: 'garden' }, bounds: { x: 200, y: 150, width: 200, height: 100 } })
    expect(screen.getByAltText('Room background preview')).toHaveAttribute('src', 'garden.png')
    fireEvent.change(screen.getByLabelText('Room background'), { target: { value: '' } })
    expect(changed.mock.lastCall?.[0].rooms[0].background).toBeNull()
    expect(screen.queryByAltText('Room background preview')).not.toBeInTheDocument()
  })
  it('draws a room in image pixels, with no invitations until a resident is chosen', () => {
    const { canvas, changed } = mount()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 350, clientY: 250 })
    fireEvent.pointerUp(canvas, { pointerId: 7 })
    expect(changed).toHaveBeenLastCalledWith({ rooms: expect.arrayContaining([expect.objectContaining({
      key: expect.stringMatching(/^loc_/), beds: 0, residentKey: null, bounds: { x: 550, y: 350, width: 300, height: 300 }
    })]) })
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7)
  })

  it('moves without snapping to center and resizes with corner handles', () => {
    const { canvas, changed, container } = mount()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Room Hall' }), { button: 0, pointerId: 1, clientX: 60, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 90, clientY: 90 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(changed.mock.lastCall?.[0].rooms[0].bounds).toEqual({ x: 260, y: 210, width: 200, height: 100 })
    fireEvent.pointerDown(container.querySelector('.map-handle--se')!, { button: 0, pointerId: 2, clientX: 180, clientY: 130 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 230, clientY: 180 })
    fireEvent.pointerUp(canvas, { pointerId: 2 })
    expect(changed.mock.lastCall?.[0].rooms[0].bounds).toEqual({ x: 310, y: 260, width: 300, height: 200 })
  })

  it('cancels capture on blur and unmount without committing a partial gesture', () => {
    const { canvas, changed, unmount } = mount()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 3, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 400, clientY: 200 })
    fireEvent.blur(window)
    fireEvent.pointerUp(canvas, { pointerId: 3 })
    expect(changed).not.toHaveBeenCalled()
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(3)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 4, clientX: 300, clientY: 100 })
    unmount()
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(4)
  })

  it('rescales hotspots with an arbitrary replacement image and edits room economics', () => {
    const { changed } = mount()
    const image = screen.getByRole('img')
    Object.defineProperty(image, 'naturalWidth', { value: 2000 })
    Object.defineProperty(image, 'naturalHeight', { value: 1200 })
    fireEvent.load(image)
    expect(changed.mock.lastCall?.[0]).toMatchObject({ floorPlanSize: { width: 2000, height: 1200 }, rooms: [
      expect.objectContaining({ bounds: { x: 400, y: 300, width: 400, height: 200 } })
    ] })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cost' }), { target: { value: '75' } })
    expect(changed.mock.lastCall?.[0].rooms[0].cost).toBe(75)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Residents' }), { target: { value: '1' } })
    expect(changed.mock.lastCall?.[0].rooms[0].beds).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove area' }))
    expect(changed.mock.lastCall?.[0].rooms[0].bounds).toBeNull()
  })

  it('expands the canvas out of narrow panes and returns with Escape', () => {
    const { changed } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(document.querySelector('.estate-floorplan.is-expanded')?.parentElement).toBe(document.body)
    expect(screen.getByRole('button', { name: 'Room Hall' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.estate-floorplan.is-expanded')).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(changed).not.toHaveBeenCalled()
  })

  it('reserves a custom space for one resident and can make it shared again', () => {
    const { changed } = mount()
    fireEvent.change(screen.getByRole('combobox', { name: 'Intended resident' }), { target: { value: 'lira' } })
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ residentKey: 'lira', beds: 1 })
    expect(screen.queryByRole('spinbutton', { name: 'Residents' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Intended resident' }), { target: { value: '' } })
    expect(changed.mock.lastCall?.[0].rooms[0]).toMatchObject({ residentKey: null, beds: 0 })
  })
})
