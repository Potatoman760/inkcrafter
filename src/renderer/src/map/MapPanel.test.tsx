// @vitest-environment jsdom
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_HOTSPOT,
  emptyMap,
  newMapArea,
  type MapArea,
  type MapDocument,
  type MapLocation
} from '@shared/bundle/mapDoc'
import { emptyNpcs } from '@shared/bundle/npcDoc'
import { emptyStats } from '@shared/statsDoc'
import { MapPanel } from './MapPanel'
import type { KnotSource } from '@shared/inkKnots'
import { emptyPlan, type PlanDocument } from '@shared/planDoc'

/**
 * What this screen must not lose.
 *
 * The map is about to be rebuilt into the design system's two-column shape and
 * it had no tests at all. These pin the things a restructure can quietly drop:
 * a place needs somewhere to travel to before it can exist, a renamed knot
 * stays visibly wrong rather than being silently repointed, the locked hint
 * only exists once there is a gate to be locked by, and the hotspot is selected
 * by pressing it on the picture rather than from a list.
 */

const KNOTS = ['the_cove', 'breedhaven']

/** The checklist places a knot by its file; nothing here owns one. */
const sourcesFor = (knots: string[]): KnotSource[] =>
  knots.map((knot) => ({ knot, file: `unowned/${knot}.ink` }))

function place(over: Partial<MapLocation> = {}): MapLocation {
  return {
    id: 'loc_1',
    label: 'The Cove',
    x: 400,
    y: 300,
    ...DEFAULT_HOTSPOT,
    destination: { to: 'knot', name: 'the_cove' },
    available: null,
    lockedHint: '',
    art: '',
    ...over
  }
}

/** One map with a picture, which is what most of these are about. */
function seeded(locations: MapLocation[] = [place()]): MapDocument {
  return {
    version: 2,
    maps: [{ ...newMapArea('World'), id: 'map_world', image: 'world_bg', locations }]
  }
}

/**
 * The rail opens on the map's own fields, so a test about a place has to press
 * it first — which is the gesture anyway: the picture is the list.
 */
function pressPlace(label: string): void {
  fireEvent.pointerDown(screen.getByRole('button', { name: label }))
}

/** The map the fixtures put everything on. */
const only = (doc: MapDocument): MapArea => doc.maps[0]!

interface Options {
  knots?: string[]
  knotSources?: KnotSource[]
  plan?: PlanDocument
  backgrounds?: string[]
  backgroundUrl?: (name: string) => string | null
  hotspots?: string[]
  hotspotUrl?: (name: string, state: string) => string | null
}

/** Controlled by the test, for asserting exactly what onChange was handed. */
function mountPanel(
  doc = seeded(),
  options: Options = {}
): { onChange: ReturnType<typeof vi.fn>; unmount: () => void } {
  const onChange = vi.fn()
  const { unmount } = render(
    <MapPanel
      doc={doc}
      saving={false}
      error={null}
      knots={options.knots ?? KNOTS}
      knotSources={options.knotSources ?? sourcesFor(options.knots ?? KNOTS)}
      plan={options.plan ?? emptyPlan()}
      stats={emptyStats()}
      npcs={emptyNpcs()}
      backgrounds={options.backgrounds ?? []}
      backgroundUrl={options.backgroundUrl ?? (() => null)}
      hotspots={options.hotspots ?? []}
      hotspotUrl={options.hotspotUrl ?? (() => null)}
      onChange={onChange}
    />
  )
  return { onChange, unmount }
}

function panel(doc = seeded(), options: Options = {}): ReturnType<typeof vi.fn> {
  return mountPanel(doc, options).onChange
}

/** Rendered against real state, for anything that types into a controlled field. */
function live(initial = seeded(), options: Options = {}): void {
  function Host(): React.JSX.Element {
    const [doc, setDoc] = useState(initial)
    return (
      <MapPanel
        doc={doc}
        saving={false}
        error={null}
        knots={options.knots ?? KNOTS}
        knotSources={options.knotSources ?? sourcesFor(options.knots ?? KNOTS)}
        plan={options.plan ?? emptyPlan()}
        stats={emptyStats()}
        npcs={emptyNpcs()}
        backgrounds={options.backgrounds ?? []}
        backgroundUrl={options.backgroundUrl ?? (() => null)}
        hotspots={options.hotspots ?? []}
        hotspotUrl={options.hotspotUrl ?? (() => null)}
        onChange={setDoc}
      />
    )
  }
  render(<Host />)
}

/**
 * The picture, as a box on screen.
 *
 * jsdom lays nothing out, so every rect is zero and the panel's pointer
 * arithmetic has nothing to divide by. Stubbing the one element it measures is
 * what lets the real conversion — screen pixels into map units — be tested at
 * all. 1024x576 against a 2048x1152 picture, so one screen pixel is two map
 * units and a wrong scale cannot pass by looking like the right one.
 */
const CANVAS_BOX = { left: 100, top: 50, width: 1024, height: 576 }

/** A map whose space is the real picture's, which is what the panel adopts. */
const BIG = { width: 2048, height: 1152 }

function stubCanvas(): HTMLElement {
  const canvas = document.querySelector('.map-canvas') as HTMLElement
  canvas.getBoundingClientRect = () =>
    ({
      ...CANVAS_BOX,
      right: CANVAS_BOX.left + CANVAS_BOX.width,
      bottom: CANVAS_BOX.top + CANVAS_BOX.height,
      x: CANVAS_BOX.left,
      y: CANVAS_BOX.top,
      toJSON: () => ({})
    }) as DOMRect
  return canvas
}

/** A point in map units, as the client coordinates that land on it. */
function client(x: number, y: number): { clientX: number; clientY: number } {
  return {
    clientX: CANVAS_BOX.left + (x / BIG.width) * CANVAS_BOX.width,
    clientY: CANVAS_BOX.top + (y / BIG.height) * CANVAS_BOX.height
  }
}

function onPicture(locations: MapLocation[] = []): MapDocument {
  return {
    version: 2,
    maps: [
      { ...newMapArea('World'), id: 'map_world', image: 'world_bg', size: BIG, locations }
    ]
  }
}

function sizedImage(): HTMLImageElement {
  const image = document.querySelector('.map-canvas img') as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { value: 2048, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: 1152, configurable: true })
  return image
}

beforeAll(() => {
  // Not implemented in jsdom, and every gesture starts by taking capture.
  Element.prototype.setPointerCapture = function setPointerCapture(): void {}
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {}
})

describe('MapPanel', () => {
  it('will not add a place while the story has nowhere to go', () => {
    panel(seeded([]), { knots: [] })

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByLabelText('New place label')).toBeDisabled()
    // Disabled, and said out loud — the control still teaches that it exists.
    expect(screen.getByText(/the story has no knots/)).toBeInTheDocument()
  })

  it('drops a new place in the middle of the picture, pointed at the first knot', async () => {
    const onChange = panel(seeded([]))

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    const next = onChange.mock.calls[0]![0] as MapDocument
    expect(only(next).locations).toHaveLength(1)
    expect(only(next).locations[0]!.destination).toEqual({ to: 'knot', name: 'the_cove' })
    expect(only(next).locations[0]!.x).toBe(Math.round(only(next).size.width / 2))
    expect(only(next).locations[0]!.y).toBe(Math.round(only(next).size.height / 2))
  })

  /**
   * The rail names the place it adds, the way every other catalogue's does.
   * Drawing one on the picture cannot ask — there is nowhere to type mid-drag —
   * so that path keeps the placeholder and the Label field renames it.
   */
  it('names a place added from the rail, and clears the box after', async () => {
    const onChange = panel(seeded([]))

    const box = screen.getByLabelText('New place label')
    await userEvent.type(box, 'The Archive{Enter}')

    const next = onChange.mock.calls[0]![0] as MapDocument
    expect(only(next).locations[0]!.label).toBe('The Archive')
    expect(box).toHaveValue('')
  })

  it('falls back to a placeholder label when the box is empty', async () => {
    const onChange = panel(seeded([]))

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(only(onChange.mock.calls[0]![0] as MapDocument).locations[0]!.label).toBe('Somewhere')
  })

  it('says the picture is bare rather than showing an empty frame', () => {
    panel(seeded(), { backgroundUrl: () => null })
    expect(screen.getByText(/No picture/)).toBeInTheDocument()
  })

  it('offers the backgrounds the media catalogue has', () => {
    panel(seeded(), { backgrounds: ['cove', 'harbour'] })

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toContain('cove')
    expect(options).toContain('harbour')
  })

  it('keeps a renamed destination listed, so it is visibly wrong', () => {
    panel(seeded([place({ destination: { to: 'knot', name: 'gone_away' } })]))
    pressPlace('The Cove')

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toContain('gone_away')
  })

  it('selects a place by pressing it on the picture', async () => {
    live(seeded([place(), place({ id: 'pln_2', label: 'Breedhaven', destination: { to: 'knot', name: 'breedhaven' } })]))

    // The rail is about the map until a place is pressed.
    expect(screen.getByLabelText('Map name')).toBeInTheDocument()

    pressPlace('The Cove')
    expect(screen.getByDisplayValue('The Cove')).toBeInTheDocument()

    pressPlace('Breedhaven')
    expect(screen.getByDisplayValue('Breedhaven')).toBeInTheDocument()
  })

  it('offers a locked hint only once there is a gate to be locked by', () => {
    panel(seeded([place({ available: null })]))
    pressPlace('The Cove')
    expect(screen.queryByText(/Hint when locked/)).not.toBeInTheDocument()
  })

  it('offers the locked hint when the place is gated', () => {
    panel(
      seeded([
        place({
          available: { op: 'compare', left: { source: 'visits', path: 'the_cove' }, cmp: '>', right: 0 }
        })
      ])
    )
    pressPlace('The Cove')

    expect(screen.getByText(/Hint when locked/)).toBeInTheDocument()
  })

  it('removes a place without asking, naming it on the button', async () => {
    const onChange = panel()
    pressPlace('The Cove')

    const button = screen.getByRole('button', { name: 'Remove The Cove' })
    expect(button).toHaveClass('ic-btn--danger')
    expect(button.querySelector('[data-icon="trash-2"]')).not.toBeNull()

    await userEvent.click(button)

    const next = onChange.mock.calls[0]![0] as MapDocument
    expect(only(next).locations).toEqual([])
  })

  it('opens on the map itself rather than on a place', () => {
    panel(seeded([]))

    expect(screen.getByLabelText('Map name')).toHaveValue('world')
    expect(screen.getByLabelText('Map picture')).toBeInTheDocument()
  })
})

/**
 * Drawing, moving and resizing.
 *
 * These three are the map editor. A rectangle over the part of the drawing it
 * belongs to is the whole job, and none of it can be done with number fields.
 */
describe('MapPanel - the picture', () => {
  it('releases the pointer when a map gesture ends', () => {
    panel(onPicture(), { backgroundUrl: () => 'app://map.png' })
    const canvas = stubCanvas()
    canvas.setPointerCapture = vi.fn()
    canvas.releasePointerCapture = vi.fn()

    fireEvent.pointerDown(canvas, { pointerId: 7, ...client(400, 200) })
    fireEvent.pointerUp(canvas, { pointerId: 7 })

    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7)
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7)
  })

  it('releases the pointer when leaving the map view mid-gesture', () => {
    const { unmount } = mountPanel(onPicture(), { backgroundUrl: () => 'app://map.png' })
    const canvas = stubCanvas()
    canvas.setPointerCapture = vi.fn()
    canvas.releasePointerCapture = vi.fn()

    fireEvent.pointerDown(canvas, { pointerId: 9, ...client(400, 200) })
    unmount()

    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(9)
  })

  it('draws a place by dragging on the picture', () => {
    const onChange = panel(onPicture(), { backgroundUrl: () => 'app://map.png' })
    const canvas = stubCanvas()

    fireEvent.pointerDown(canvas, { pointerId: 1, ...client(400, 200) })
    fireEvent.pointerMove(canvas, { pointerId: 1, ...client(700, 500) })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    const next = onChange.mock.calls.at(-1)![0] as MapDocument
    expect(only(next).locations).toHaveLength(1)
    // Centre and size, from the two corners the pointer went between.
    expect(only(next).locations[0]).toMatchObject({ x: 550, y: 350, width: 300, height: 300 })
  })

  it('draws the same rectangle dragged the other way', () => {
    const onChange = panel(onPicture(), { backgroundUrl: () => 'app://map.png' })
    const canvas = stubCanvas()

    fireEvent.pointerDown(canvas, { pointerId: 1, ...client(700, 500) })
    fireEvent.pointerMove(canvas, { pointerId: 1, ...client(400, 200) })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    const next = onChange.mock.calls.at(-1)![0] as MapDocument
    expect(only(next).locations[0]).toMatchObject({ x: 550, y: 350, width: 300, height: 300 })
  })

  it('treats a press with no drag as a click, not a place', () => {
    const onChange = panel(onPicture([place()]), { backgroundUrl: () => 'app://map.png' })
    const canvas = stubCanvas()

    fireEvent.pointerDown(canvas, { pointerId: 1, ...client(400, 200) })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
    // Deselected, so the rail is about the map again.
    expect(screen.getByLabelText('Map name')).toBeInTheDocument()
  })

  it('will not draw while the story has nowhere to travel to', () => {
    const onChange = panel(onPicture(), { backgroundUrl: () => 'app://map.png', knots: [] })
    const canvas = stubCanvas()

    fireEvent.pointerDown(canvas, { pointerId: 1, ...client(400, 200) })
    fireEvent.pointerMove(canvas, { pointerId: 1, ...client(700, 500) })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves a place by dragging it, without resizing it', () => {
    const onChange = panel(onPicture([place({ x: 400, y: 300, width: 200, height: 100 })]), {
      backgroundUrl: () => 'app://map.png'
    })
    stubCanvas()

    const hotspot = document.querySelector('.map-hotspot') as HTMLElement
    fireEvent.pointerDown(hotspot, { pointerId: 1, ...client(400, 300) })
    fireEvent.pointerMove(hotspot, { pointerId: 1, ...client(900, 600) })

    const next = onChange.mock.calls.at(-1)![0] as MapDocument
    expect(only(next).locations[0]).toMatchObject({ x: 900, y: 600, width: 200, height: 100 })
  })

  it('resizes from a handle, leaving the opposite edge alone', () => {
    const onChange = panel(onPicture([place({ x: 400, y: 300, width: 200, height: 100 })]), {
      backgroundUrl: () => 'app://map.png'
    })
    stubCanvas()
    pressPlace('The Cove')

    // The east handle out to 800: the west edge stays where it was, at 300.
    const east = document.querySelector('.map-handle--e') as HTMLElement
    fireEvent.pointerDown(east, { pointerId: 1, ...client(500, 300) })
    fireEvent.pointerMove(east, { pointerId: 1, ...client(800, 300) })

    const box = only(onChange.mock.calls.at(-1)![0] as MapDocument).locations[0]!
    expect(box.x - box.width / 2).toBe(300)
    expect(box.x + box.width / 2).toBe(800)
    expect(box.height).toBe(100)
  })

  it('presses through to the place rather than drawing on top of it', () => {
    const onChange = panel(onPicture([place({ x: 400, y: 300, width: 200, height: 100 })]), {
      backgroundUrl: () => 'app://map.png'
    })
    stubCanvas()

    const hotspot = document.querySelector('.map-hotspot') as HTMLElement
    fireEvent.pointerDown(hotspot, { pointerId: 1, ...client(400, 300) })
    fireEvent.pointerUp(hotspot, { pointerId: 1 })

    const counts = onChange.mock.calls.map((call) => only(call[0] as MapDocument).locations.length)
    expect(counts.every((count) => count === 1)).toBe(true)
  })

  it('draws a gated place differently, so the map reads as the game will', () => {
    panel(
      onPicture([
        place({ id: 'pln_1', label: 'Open', available: null }),
        place({
          id: 'pln_2',
          label: 'Shut',
          available: { op: 'compare', left: { source: 'stat', key: 'resolve' }, cmp: '>=', right: 3 }
        })
      ]),
      { backgroundUrl: () => 'app://map.png' }
    )

    const [open, shut] = Array.from(document.querySelectorAll('.map-hotspot'))
    expect(open!.className).not.toContain('is-gated')
    expect(shut!.className).toContain('is-gated')
  })

  it('puts handles on the selected place and nowhere else', () => {
    panel(
      onPicture([place({ id: 'loc_1' }), place({ id: 'loc_2', label: 'Other' })]),
      { backgroundUrl: () => 'app://map.png' }
    )
    pressPlace('The Cove')

    // One set, on the one selected — eight of them, so every edge and corner.
    expect(document.querySelectorAll('.map-handles')).toHaveLength(1)
    expect(document.querySelectorAll('.map-handle')).toHaveLength(8)
  })
})

describe('MapPanel - the coordinate space', () => {
  it('adopts the size of the picture when it loads', () => {
    const onChange = panel(seeded([]), { backgroundUrl: () => 'app://map.png' })
    fireEvent.load(sizedImage())

    expect(only(onChange.mock.calls[0]![0] as MapDocument).size).toEqual(BIG)
  })

  it('rescales what is already placed, so it stays over the same drawing', () => {
    // Dead centre of the old 1280x720 space.
    const onChange = panel(seeded([place({ x: 640, y: 360 })]), { backgroundUrl: () => 'app://map.png' })
    fireEvent.load(sizedImage())

    const next = onChange.mock.calls[0]![0] as MapDocument
    expect(only(next).locations[0]!.x / only(next).size.width).toBeCloseTo(0.5, 5)
    expect(only(next).locations[0]!.y / only(next).size.height).toBeCloseTo(0.5, 5)
  })

  it('says nothing when the picture is already the space', () => {
    const onChange = panel(onPicture([place()]), { backgroundUrl: () => 'app://map.png' })
    fireEvent.load(sizedImage())

    // No write, so no autosave, and no loop through onLoad.
    expect(onChange).not.toHaveBeenCalled()
  })

  // fireEvent rather than userEvent: the field is controlled by the document,
  // and typing digit by digit against a mock that never feeds one back tests
  // the mock rather than the panel.
  it('types an area exactly, for an edge the mouse cannot land on', () => {
    const onChange = panel(onPicture([place({ x: 400, y: 300, width: 200, height: 100 })]))
    pressPlace('The Cove')

    fireEvent.change(screen.getByLabelText('Width of The Cove'), { target: { value: '640' } })

    const next = onChange.mock.calls.at(-1)![0] as MapDocument
    expect(only(next).locations[0]!.width).toBe(640)
    // The centre holds: widening a place grows it both ways, as the handles do.
    expect(only(next).locations[0]!.x).toBe(400)
  })

  it('will not let a typed area leave the picture', () => {
    const onChange = panel(onPicture([place({ x: 2000, y: 300, width: 200, height: 100 })]))
    pressPlace('The Cove')

    fireEvent.change(screen.getByLabelText('Width of The Cove'), { target: { value: '9999' } })

    const box = only(onChange.mock.calls.at(-1)![0] as MapDocument).locations[0]!
    expect(box.x + box.width / 2).toBeLessThanOrEqual(BIG.width)
    expect(box.x - box.width / 2).toBeGreaterThanOrEqual(0)
  })
})

/**
 * Art on a hotspot.
 *
 * The art is one picture at four moments, so the box has to be its shape or
 * every state is stretched. The shape is learnt from the picture the browser
 * loaded rather than stored, which is why these have to render one.
 */
describe('MapPanel - hotspot art', () => {
  const ART = { hotspots: ['seedblossom'], hotspotUrl: () => 'app://hotspot.png' }

  /** Tells the panel the loaded art is 2:1, the way an <img> would. */
  function loadArt(width = 400, height = 200): void {
    const image = document.querySelector('.map-hotspot img') as HTMLImageElement
    Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
    Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
    fireEvent.load(image)
  }

  it('draws the art instead of a bare rectangle', () => {
    panel(onPicture([place({ art: 'seedblossom' })]), { backgroundUrl: () => 'app://map.png', ...ART })

    const hotspot = document.querySelector('.map-hotspot')!
    expect(hotspot.className).toContain('has-art')
    expect(hotspot.querySelector('img')).toHaveAttribute('src', 'app://hotspot.png')
  })

  it('draws a plain rectangle for a place with no art', () => {
    panel(onPicture([place()]), { backgroundUrl: () => 'app://map.png', ...ART })

    const hotspot = document.querySelector('.map-hotspot')!
    expect(hotspot.className).not.toContain('has-art')
    expect(hotspot.querySelector('img')).toBeNull()
  })

  it('asks for the disabled art of a gated place', () => {
    const asked: string[] = []
    panel(
      onPicture([
        place({
          art: 'seedblossom',
          available: { op: 'compare', left: { source: 'stat', key: 'resolve' }, cmp: '>=', right: 3 }
        })
      ]),
      {
        backgroundUrl: () => 'app://map.png',
        hotspots: ['seedblossom'],
        hotspotUrl: (_name, state) => {
          asked.push(state)
          return 'app://hotspot.png'
        }
      }
    )

    // What the reader sees until they open it, which is the point of drawing
    // the art in the editor at all.
    expect(asked).toContain('disabled')
  })

  it('holds the box to the art’s shape when it is resized', () => {
    const onChange = panel(
      onPicture([place({ art: 'seedblossom', x: 400, y: 300, width: 200, height: 100 })]),
      { backgroundUrl: () => 'app://map.png', ...ART }
    )
    stubCanvas()
    loadArt(400, 200)
    pressPlace('The Cove')

    // Drag the east handle far out: the width leads and the height follows.
    const east = document.querySelector('.map-handle--e') as HTMLElement
    fireEvent.pointerDown(east, { pointerId: 1, ...client(500, 300) })
    fireEvent.pointerMove(east, { pointerId: 1, ...client(900, 300) })

    const box = only(onChange.mock.calls.at(-1)![0] as MapDocument).locations[0]!
    expect(box.width / box.height).toBeCloseTo(2, 2)
    // And the west edge, which was not dragged, has not moved.
    expect(box.x - box.width / 2).toBe(300)
  })

  it('leaves a place without art free to be any shape', () => {
    const onChange = panel(
      onPicture([place({ x: 400, y: 300, width: 200, height: 100 })]),
      { backgroundUrl: () => 'app://map.png', ...ART }
    )
    stubCanvas()
    pressPlace('The Cove')

    const east = document.querySelector('.map-handle--e') as HTMLElement
    fireEvent.pointerDown(east, { pointerId: 1, ...client(500, 300) })
    fireEvent.pointerMove(east, { pointerId: 1, ...client(900, 300) })

    const box = only(onChange.mock.calls.at(-1)![0] as MapDocument).locations[0]!
    expect(box.height).toBe(100)
    expect(box.width).toBe(600)
  })

  it('reshapes the box the moment art is chosen', async () => {
    const onChange = panel(
      onPicture([place({ art: 'seedblossom', x: 400, y: 300, width: 200, height: 100 })]),
      { backgroundUrl: () => 'app://map.png', ...ART }
    )
    loadArt(400, 400)
    pressPlace('The Cove')

    // Re-choosing the same art is the gesture: the shape is known now.
    await userEvent.selectOptions(screen.getByLabelText(/^Art/), 'seedblossom')

    const box = only(onChange.mock.calls.at(-1)![0] as MapDocument).locations[0]!
    expect(box.width).toBe(box.height)
    // Around the centre, since no edge was being dragged.
    expect(box.x).toBe(400)
    expect(box.y).toBe(300)
  })

  it('keeps art that is no longer catalogued, and says so', () => {
    panel(onPicture([place({ art: 'gone' })]), { backgroundUrl: () => 'app://map.png', ...ART })
    pressPlace('The Cove')

    expect(screen.getByText(/no hotspot called/)).toBeInTheDocument()
    const options = Array.from(
      (screen.getByLabelText(/^Art/) as HTMLSelectElement).options
    ).map((one) => one.value)
    expect(options).toContain('gone')
  })
})

/**
 * Several maps that open each other.
 *
 * The overworld's city gate opens the city, and the city's road out opens the
 * overworld again. Which one is being edited is a dropdown rather than a second
 * list down the side: the picture is still the list of places, and a 340px rail
 * cannot hold two of them.
 */
describe('MapPanel - more than one map', () => {
  function twoMaps(overworldPlaces: MapLocation[] = []): MapDocument {
    return {
      version: 2,
      maps: [
        {
          ...newMapArea('World'),
          id: 'map_world',
          image: 'world_bg',
          knots: ['the_cove'],
          locations: overworldPlaces
        },
        { ...newMapArea('City'), id: 'map_city', display: 'The City', image: 'city_bg' }
      ]
    }
  }

  it('offers every map, showing the one being edited', () => {
    panel(twoMaps())

    const options = Array.from(
      (screen.getByLabelText('Map') as HTMLSelectElement).options
    ).map((one) => one.textContent)
    expect(options).toEqual(['World', 'The City'])
  })

  it('switches the picture and the places together', () => {
    const seen: string[] = []
    panel(twoMaps([place()]), {
      backgroundUrl: (name) => {
        seen.push(name)
        return `app://${name}.png`
      }
    })

    expect(screen.getByRole('button', { name: 'The Cove' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'map_city' } })

    expect(screen.queryByRole('button', { name: 'The Cove' })).not.toBeInTheDocument()
    expect(seen).toContain('city_bg')
  })

  it('adds a map and opens on it', async () => {
    const onChange = panel(twoMaps())

    await userEvent.click(screen.getByRole('button', { name: 'Add a map' }))

    const next = onChange.mock.calls[0]![0] as MapDocument
    expect(next.maps).toHaveLength(3)
    expect(next.maps[2]!.name).toBe('new_map')
  })

  it('refuses a name another map already has, and does not save it', async () => {
    const onChange = panel(twoMaps())

    const name = screen.getByLabelText('Map name')
    await userEvent.clear(name)
    await userEvent.type(name, 'city')
    expect(screen.getByText('There is already a map called city.')).toBeInTheDocument()

    await userEvent.tab()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renames a map, following the hotspots that opened it', async () => {
    const onChange = panel(
      twoMaps([place({ destination: { to: 'map', name: 'city' } })])
    )

    fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'map_city' } })
    const name = screen.getByLabelText('Map name')
    await userEvent.clear(name)
    await userEvent.type(name, 'the_capital')
    await userEvent.tab()

    const next = onChange.mock.calls.at(-1)![0] as MapDocument
    expect(next.maps[1]!.name).toBe('the_capital')
    expect(next.maps[0]!.locations[0]!.destination).toEqual({ to: 'map', name: 'the_capital' })
  })

  it('offers the other maps as a destination, but never this one', async () => {
    // Live, because the second control only exists once the kind has changed.
    live(twoMaps([place()]))
    pressPlace('The Cove')

    await userEvent.selectOptions(screen.getByLabelText('Kind of destination'), 'map')

    const options = Array.from(
      (screen.getByLabelText('Destination map') as HTMLSelectElement).options
    ).map((one) => one.textContent)
    expect(options).toEqual(['The City'])
  })

  /** Both at once, so a kind can never sit beside a name meant for the other. */
  it('sets the kind and the name together when the kind changes', async () => {
    const onChange = panel(twoMaps([place()]))
    pressPlace('The Cove')

    await userEvent.selectOptions(screen.getByLabelText('Kind of destination'), 'map')

    const next = onChange.mock.calls.at(-1)![0] as MapDocument
    expect(next.maps[0]!.locations[0]!.destination).toEqual({ to: 'map', name: 'city' })
  })

  it('keeps a map destination nothing answers to, and says so', async () => {
    panel(twoMaps([place({ destination: { to: 'map', name: 'gone' } })]))
    pressPlace('The Cove')

    expect(screen.getByText(/no other map called/)).toBeInTheDocument()
    expect(screen.getByLabelText('Destination map')).toHaveValue('gone')
  })

  it('tells a doorway apart from a place that travels', () => {
    panel(
      twoMaps([
        place({ id: 'loc_1', label: 'Gate', destination: { to: 'map', name: 'city' } }),
        place({ id: 'loc_2', label: 'Cove' })
      ]),
      { backgroundUrl: () => 'app://map.png' }
    )

    expect(screen.getByRole('button', { name: 'Gate' }).className).toContain('is-doorway')
    expect(screen.getByRole('button', { name: 'Cove' }).className).not.toContain('is-doorway')
  })

  /**
   * The knots a map is the map for, chosen from the plan's own shape.
   *
   * A checklist rather than a dropdown, because what an author means is "the
   * whole of chapter one" — which an alphabetical list of identifiers cannot be
   * asked for. `KnotChecklist.test.tsx` covers the control; these are about the
   * panel handing it the right things and storing what comes back.
   */
  describe('the knots a map is the default for', () => {
    it('shows what is checked, and checks another', async () => {
      const onChange = panel(twoMaps())

      expect(screen.getByRole('checkbox', { name: 'the_cove' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'breedhaven' })).not.toBeChecked()

      await userEvent.click(screen.getByRole('checkbox', { name: 'breedhaven' }))

      const next = onChange.mock.calls[0]![0] as MapDocument
      expect(next.maps[0]!.knots).toEqual(['the_cove', 'breedhaven'])
    })

    it('takes one off when it is unchecked', async () => {
      const onChange = panel(twoMaps())

      await userEvent.click(screen.getByRole('checkbox', { name: 'the_cove' }))

      expect((onChange.mock.calls[0]![0] as MapDocument).maps[0]!.knots).toEqual([])
    })

    /** The checklist can only offer what exists, so these need their own way off. */
    it('says when a listed knot is no longer in the story, and takes it off', async () => {
      const doc = twoMaps()
      doc.maps[0]!.knots = ['gone_away']
      const onChange = panel(doc)

      expect(screen.getByText(/no longer in the story/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'gone_away' }))

      expect((onChange.mock.calls[0]![0] as MapDocument).maps[0]!.knots).toEqual([])
    })

    it("keeps each map's list to itself", async () => {
      const onChange = panel(twoMaps())
      fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'map_city' } })

      expect(screen.getByRole('checkbox', { name: 'the_cove' })).not.toBeChecked()

      await userEvent.click(screen.getByRole('checkbox', { name: 'the_cove' }))

      const next = onChange.mock.calls[0]![0] as MapDocument
      expect(next.maps[0]!.knots).toEqual(['the_cove'])
      expect(next.maps[1]!.knots).toEqual(['the_cove'])
    })
  })

  describe('removing a map', () => {
    it('warns first when another map opens it', () => {
      panel(twoMaps([place({ destination: { to: 'map', name: 'city' } })]))
      fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'map_city' } })

      expect(screen.getByText(/World opens this map/)).toBeInTheDocument()
    })

    it('says nothing when nothing opens it', () => {
      panel(twoMaps())
      fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'map_city' } })

      expect(screen.queryByText(/opens this map/)).not.toBeInTheDocument()
    })

    it('removes it, leaving the rest', async () => {
      const onChange = panel(twoMaps())

      await userEvent.click(screen.getByRole('button', { name: 'Remove World' }))

      expect((onChange.mock.calls[0]![0] as MapDocument).maps.map((one) => one.name)).toEqual([
        'city'
      ])
    })
  })

  it('offers a way in when there are no maps at all', async () => {
    const onChange = panel(emptyMap())

    await userEvent.click(screen.getByRole('button', { name: 'Add a map' }))

    expect((onChange.mock.calls[0]![0] as MapDocument).maps).toHaveLength(1)
  })
})
