import { describe, expect, it } from 'vitest'
import {
  boxOf,
  clampRect,
  fitToAspect,
  mapForKnot,
  mapName,
  mapNameProblem,
  mapsLinkingTo,
  MIN_HOTSPOT,
  moveTo,
  newMapArea,
  parseMap,
  rectBetween,
  rectOf,
  renameMap,
  rescaleLocations,
  resizeRect,
  serialiseMap,
  type MapDocument,
  type MapLocation
} from './mapDoc'

/**
 * The arithmetic behind drawing a hotspot.
 *
 * A location is stored as a centre and a size and manipulated as four edges, so
 * every gesture crosses that conversion twice. These pin the crossings, and the
 * cases a mouse finds immediately: dragging a rectangle inside out, dragging it
 * off the picture, and swapping the picture for one of another size.
 */

const SIZE = { width: 2048, height: 1152 }

function place(over: Partial<MapLocation> = {}): MapLocation {
  return {
    id: 'pln_1',
    label: 'Seedblossom',
    x: 1000,
    y: 500,
    width: 200,
    height: 100,
    destination: { to: 'knot', name: 'chapter1' },
    available: null,
    lockedHint: '',
    art: '',
    ...over
  }
}

describe('rectOf and boxOf', () => {
  it('round-trip a location without moving it', () => {
    const location = place()
    expect(boxOf(rectOf(location))).toEqual({ x: 1000, y: 500, width: 200, height: 100 })
  })

  it('read the stored centre as edges', () => {
    expect(rectOf(place())).toEqual({ left: 900, top: 450, right: 1100, bottom: 550 })
  })

  it('round a half-unit edge rather than storing a fraction', () => {
    expect(boxOf({ left: 0, top: 0, right: 15, bottom: 7 })).toEqual({
      x: 8,
      y: 4,
      width: 15,
      height: 7
    })
  })
})

describe('rectBetween', () => {
  it('makes a rectangle from two corners dragged south-east', () => {
    expect(rectBetween({ x: 10, y: 20 }, { x: 110, y: 80 })).toEqual({
      left: 10,
      top: 20,
      right: 110,
      bottom: 80
    })
  })

  it('makes the same rectangle dragged north-west', () => {
    // Drawing goes in all four directions, so the corner you start from cannot
    // be assumed to be the top-left one.
    expect(rectBetween({ x: 110, y: 80 }, { x: 10, y: 20 })).toEqual({
      left: 10,
      top: 20,
      right: 110,
      bottom: 80
    })
  })
})

describe('resizeRect', () => {
  const rect = { left: 100, top: 100, right: 300, bottom: 200 }

  it('moves one edge for an edge handle and leaves the other three', () => {
    expect(resizeRect(rect, 'e', { x: 400, y: 999 })).toEqual({
      left: 100,
      top: 100,
      right: 400,
      bottom: 200
    })
    expect(resizeRect(rect, 'n', { x: 999, y: 50 })).toEqual({
      left: 100,
      top: 50,
      right: 300,
      bottom: 200
    })
  })

  it('moves two edges for a corner handle', () => {
    expect(resizeRect(rect, 'se', { x: 400, y: 250 })).toEqual({
      left: 100,
      top: 100,
      right: 400,
      bottom: 250
    })
  })

  it('leaves the opposite edge where it was, which is the whole point of a handle', () => {
    // Widening a mountain range from the east must not walk its western edge.
    expect(resizeRect(rect, 'w', { x: 20, y: 0 }).right).toBe(300)
    expect(resizeRect(rect, 's', { x: 0, y: 900 }).top).toBe(100)
  })

  it('swaps edges dragged past each other rather than inverting', () => {
    const pulled = resizeRect(rect, 'e', { x: 40, y: 150 })
    expect(pulled.left).toBeLessThan(pulled.right)
    expect(pulled).toEqual({ left: 40, top: 100, right: 100, bottom: 200 })
  })
})

/**
 * Holding a hotspot to the shape of its art.
 *
 * The art is one picture at four moments, so the box has to be that picture's
 * shape or every state is stretched. What earns the tests is *which* edge wins:
 * the one being dragged is the one the author is looking at, and the corner
 * opposite it must not walk.
 */
describe('fitToAspect', () => {
  // 200x100, and art twice as wide as it is tall.
  const rect = { left: 100, top: 100, right: 300, bottom: 200 }

  it('leaves a box that is already the right shape', () => {
    expect(fitToAspect(rect, 2, 'e')).toEqual(rect)
  })

  it('takes the width from an east or west drag and follows with the height', () => {
    const wide = fitToAspect({ left: 100, top: 100, right: 500, bottom: 200 }, 2, 'e')

    expect(wide.right - wide.left).toBe(400)
    expect(wide.bottom - wide.top).toBe(200)
    // The west edge is not the one being dragged, so it does not move.
    expect(wide.left).toBe(100)
  })

  it('takes the height from a north or south drag', () => {
    const tall = fitToAspect({ left: 100, top: 100, right: 300, bottom: 400 }, 2, 's')

    expect(tall.bottom - tall.top).toBe(300)
    expect(tall.right - tall.left).toBe(600)
    expect(tall.top).toBe(100)
  })

  it('grows from the anchored corner when the handle is a western one', () => {
    // Dragging west: the east edge is the anchor and stays put.
    const pulled = fitToAspect({ left: -100, top: 100, right: 300, bottom: 200 }, 2, 'w')

    expect(pulled.right).toBe(300)
    expect(pulled.right - pulled.left).toBe(400)
  })

  it('anchors on the south-east when dragging the north-west corner', () => {
    const pulled = fitToAspect({ left: -100, top: -100, right: 300, bottom: 200 }, 2, 'nw')

    expect(pulled.right).toBe(300)
    expect(pulled.bottom).toBe(200)
  })

  it('takes whichever dimension a corner drag moved further', () => {
    // Dragged far wider than taller, so the width leads.
    const wide = fitToAspect({ left: 100, top: 100, right: 900, bottom: 220 }, 2, 'se')
    expect(wide.right - wide.left).toBe(800)

    // And the other way round.
    const tall = fitToAspect({ left: 100, top: 100, right: 320, bottom: 900 }, 2, 'se')
    expect(tall.bottom - tall.top).toBe(800)
  })

  it('holds the centre when there is no handle, which is how art is first applied', () => {
    const fitted = fitToAspect(rect, 1, null)

    expect((fitted.left + fitted.right) / 2).toBe(200)
    expect((fitted.top + fitted.bottom) / 2).toBe(150)
    expect(fitted.right - fitted.left).toBe(fitted.bottom - fitted.top)
  })

  it('refuses a nonsense aspect rather than producing a nonsense box', () => {
    // A picture that has not loaded has no dimensions, and dividing by them
    // would collapse the hotspot to nothing.
    expect(fitToAspect(rect, 0, 'e')).toEqual(rect)
    expect(fitToAspect(rect, Number.NaN, 'e')).toEqual(rect)
  })
})

describe('clampRect', () => {
  it('leaves a rectangle inside the picture alone', () => {
    const rect = { left: 100, top: 100, right: 300, bottom: 200 }
    expect(clampRect(rect, SIZE)).toEqual(rect)
  })

  it('stops at the edge rather than running off it', () => {
    const rect = clampRect({ left: -50, top: -20, right: 5000, bottom: 5000 }, SIZE)
    expect(rect).toEqual({ left: 0, top: 0, right: 2048, bottom: 1152 })
  })

  it('holds a rectangle open at the minimum rather than letting it collapse', () => {
    const rect = clampRect({ left: 500, top: 500, right: 500, bottom: 500 }, SIZE)
    expect(rect.right - rect.left).toBe(MIN_HOTSPOT)
    expect(rect.bottom - rect.top).toBe(MIN_HOTSPOT)
  })

  it('keeps the minimum on the picture when the drag ended past the far edge', () => {
    const rect = clampRect({ left: 3000, top: 3000, right: 3000, bottom: 3000 }, SIZE)
    expect(rect.right).toBeLessThanOrEqual(SIZE.width)
    expect(rect.bottom).toBeLessThanOrEqual(SIZE.height)
    expect(rect.right - rect.left).toBe(MIN_HOTSPOT)
  })
})

describe('moveTo', () => {
  it('puts the centre where it was asked', () => {
    expect(moveTo(place(), { x: 600, y: 400 }, SIZE)).toEqual({ x: 600, y: 400 })
  })

  it('stops the box at the edge, not the centre', () => {
    // A 200-wide place cannot have its centre at 0 without half of it hanging
    // off the picture.
    expect(moveTo(place(), { x: 0, y: 0 }, SIZE)).toEqual({ x: 100, y: 50 })
    expect(moveTo(place(), { x: 9999, y: 9999 }, SIZE)).toEqual({ x: 1948, y: 1102 })
  })
})

describe('rescaleLocations', () => {
  const from = { width: 1280, height: 720 }

  it('keeps a place over the same part of the drawing', () => {
    const [scaled] = rescaleLocations([place({ x: 640, y: 360 })], from, SIZE)

    // Dead centre in one space is dead centre in the other.
    expect(scaled!.x / SIZE.width).toBeCloseTo(0.5, 5)
    expect(scaled!.y / SIZE.height).toBeCloseTo(0.5, 5)
  })

  it('scales the size along with the position', () => {
    const [scaled] = rescaleLocations([place({ width: 200, height: 100 })], from, SIZE)
    expect(scaled).toMatchObject({ width: 320, height: 160 })
  })

  it('does nothing when the space has not changed', () => {
    const locations = [place()]
    expect(rescaleLocations(locations, SIZE, SIZE)).toBe(locations)
  })

  it('refuses to divide by a degenerate space', () => {
    const locations = [place()]
    expect(rescaleLocations(locations, { width: 0, height: 0 }, SIZE)).toBe(locations)
  })

  it('never scales a place away to nothing', () => {
    const [scaled] = rescaleLocations(
      [place({ width: 10, height: 10 })],
      { width: 4000, height: 4000 },
      { width: 100, height: 100 }
    )
    expect(scaled!.width).toBeGreaterThanOrEqual(MIN_HOTSPOT)
  })
})

/**
 * Reading a map document, including one written before there was more than one.
 *
 * The migration is the one thing here that can destroy an author's work: a
 * picture chosen, a space laid out and forty hotspots placed on it all live in
 * fields that moved a level down. So it is pinned harder than anything else.
 */
describe('parseMap', () => {
  const V1 = JSON.stringify({
    version: 1,
    image: 'harbour_bg',
    size: { width: 2048, height: 1152 },
    locations: [
      { id: 'pln_1', label: 'The Archive', x: 100, y: 50, width: 200, height: 60, target: 'archive' }
    ]
  })

  it('reads a one-map document as one map, losing nothing', () => {
    const doc = parseMap(V1)

    expect(doc.version).toBe(2)
    expect(doc.maps).toHaveLength(1)
    const world = doc.maps[0]!
    expect(world.name).toBe('world')
    expect(world.image).toBe('harbour_bg')
    expect(world.size).toEqual({ width: 2048, height: 1152 })
    expect(world.knots).toEqual([])
    expect(world.locations).toHaveLength(1)
    expect(world.locations[0]).toMatchObject({
      label: 'The Archive',
      x: 100,
      y: 50,
      destination: { to: 'knot', name: 'archive' }
    })
  })

  /** A picture somebody chose is a decision, even with nothing placed on it. */
  it('keeps a one-map document that has a picture but no places', () => {
    const doc = parseMap('{"version":1,"image":"harbour_bg","locations":[]}')

    expect(doc.maps).toHaveLength(1)
    expect(doc.maps[0]!.image).toBe('harbour_bg')
  })

  it('reads a many-map document', () => {
    const doc = parseMap(
      JSON.stringify({
        version: 2,
        maps: [
          { id: 'map_1', name: 'world', display: 'World', knots: ['road'], locations: [] },
          { id: 'map_2', name: 'city', display: 'The City', knots: [], locations: [] }
        ]
      })
    )

    expect(doc.maps.map((map) => map.name)).toEqual(['world', 'city'])
    expect(doc.maps[0]!.knots).toEqual(['road'])
  })

  it('round-trips itself', () => {
    const doc = parseMap(V1)
    expect(parseMap(serialiseMap(doc))).toEqual(doc)
  })

  it('comes back empty rather than throwing on anything unreadable', () => {
    for (const source of ['', 'nope', '[]', 'null', '"a string"', '42', '{}']) {
      expect(parseMap(source)).toEqual({ version: 2, maps: [] })
    }
  })

  describe('a place with nowhere to go', () => {
    const withLocation = (location: unknown): MapLocation[] =>
      parseMap(JSON.stringify({ version: 2, maps: [{ name: 'world', locations: [location] }] }))
        .maps[0]!.locations

    it('is dropped whether it named a knot or a map', () => {
      expect(withLocation({ label: 'Nowhere' })).toEqual([])
      expect(withLocation({ label: 'Nowhere', target: '  ' })).toEqual([])
      expect(withLocation({ label: 'Nowhere', destination: { to: 'map', name: '' } })).toEqual([])
    })

    it('reads a map destination as one', () => {
      expect(withLocation({ destination: { to: 'map', name: 'city' } })[0]).toMatchObject({
        destination: { to: 'map', name: 'city' },
        // A place that never said what to call it is called where it goes.
        label: 'city'
      })
    })

    /** Likelier a knot than a map, and guessing map would stop it travelling. */
    it('treats a destination kind it cannot read as a knot', () => {
      expect(withLocation({ destination: { to: 'sideways', name: 'archive' } })[0]).toMatchObject({
        destination: { to: 'knot', name: 'archive' }
      })
    })

    it('prefers a destination over the older target beside it', () => {
      expect(
        withLocation({ target: 'old', destination: { to: 'map', name: 'city' } })[0]
      ).toMatchObject({ destination: { to: 'map', name: 'city' } })
    })

    it('is given an id, because selection is by id', () => {
      expect(withLocation({ target: 'archive' })[0]!.id).toMatch(/^loc_/)
    })
  })

  /** The one departure from its siblings: a nameless map is still a drawing. */
  it('renames a map that has no name rather than dropping it', () => {
    const doc = parseMap(
      '{"version":2,"maps":[{"display":"The City","image":"city_bg","locations":[]}]}'
    )

    expect(doc.maps).toHaveLength(1)
    expect(doc.maps[0]!.name).toBe('the_city')
    expect(doc.maps[0]!.image).toBe('city_bg')
  })

  it('drops a claimed knot that is not a name, and repeats of one that is', () => {
    const doc = parseMap(
      '{"version":2,"maps":[{"name":"city","knots":["gate",7,"gate",""],"locations":[]}]}'
    )

    expect(doc.maps[0]!.knots).toEqual(['gate'])
  })
})

describe('mapName and mapNameProblem', () => {
  const twoMaps = (): MapDocument => ({
    version: 2,
    maps: [newMapArea('World'), { ...newMapArea('The City'), id: 'map_city' }]
  })

  it('turns what was typed into an identifier', () => {
    expect(mapName('The City')).toBe('the_city')
    expect(mapName('  Harbour!  ')).toBe('harbour')
    expect(mapName('2fort')).toBe('_2fort')
    expect(mapName('???')).toBe('')
  })

  it('refuses a name already taken, and a name with nothing in it', () => {
    expect(mapNameProblem(twoMaps(), 'World')).toBe('There is already a map called world.')
    expect(mapNameProblem(twoMaps(), '???')).toBe('A name needs at least one letter or digit.')
    expect(mapNameProblem(twoMaps(), 'The Keep')).toBeNull()
  })

  it('lets a map keep its own name while being renamed', () => {
    expect(mapNameProblem(twoMaps(), 'The City', 'map_city')).toBeNull()
  })
})

/**
 * Maps are named rather than referenced by id, the same way art, pictures and
 * knots are named here — so a rename has to follow its own references.
 */
describe('renameMap', () => {
  const linked = (): MapDocument => ({
    version: 2,
    maps: [
      {
        ...newMapArea('World'),
        id: 'map_world',
        locations: [{ ...place(), id: 'loc_gate', destination: { to: 'map', name: 'city' } }]
      },
      { ...newMapArea('City'), id: 'map_city' }
    ]
  })

  it('repoints every hotspot that opened it', () => {
    const next = renameMap(linked(), 'map_city', 'The Capital')

    expect(next.maps[1]!.name).toBe('the_capital')
    expect(next.maps[0]!.locations[0]!.destination).toEqual({ to: 'map', name: 'the_capital' })
  })

  it('leaves a hotspot that travels to a knot of the same name alone', () => {
    const doc = linked()
    doc.maps[0]!.locations[0]!.destination = { to: 'knot', name: 'city' }

    const next = renameMap(doc, 'map_city', 'The Capital')
    expect(next.maps[0]!.locations[0]!.destination).toEqual({ to: 'knot', name: 'city' })
  })

  it('does nothing when the name is unusable or unchanged', () => {
    const doc = linked()
    expect(renameMap(doc, 'map_city', '???')).toBe(doc)
    expect(renameMap(doc, 'map_city', 'City')).toBe(doc)
    expect(renameMap(doc, 'map_nobody', 'Elsewhere')).toBe(doc)
  })

  it('says which maps open one, so removing it can warn', () => {
    expect(mapsLinkingTo(linked(), 'city').map((map) => map.name)).toEqual(['world'])
    expect(mapsLinkingTo(linked(), 'world')).toEqual([])
  })
})

/**
 * Which map a knot belongs to. The game is a separate program and has to
 * implement this same rule, so it is pinned here as the thing to match.
 */
describe('mapForKnot', () => {
  const doc: MapDocument = {
    version: 2,
    maps: [
      { ...newMapArea('World'), knots: ['road'] },
      { ...newMapArea('City'), knots: ['city', 'the_inn'] }
    ]
  }

  it('finds the map that claimed the knot', () => {
    expect(mapForKnot(doc, 'road')?.name).toBe('world')
    expect(mapForKnot(doc, 'the_inn')?.name).toBe('city')
  })

  /** Claiming `city` is meant to be enough for everything under it. */
  it('gives a stitch the map its knot belongs to', () => {
    expect(mapForKnot(doc, 'city.market')?.name).toBe('city')
  })

  it('prefers a stitch claimed outright over its knot', () => {
    const outright: MapDocument = {
      version: 2,
      maps: [...doc.maps, { ...newMapArea('Market'), knots: ['city.market'] }]
    }
    expect(mapForKnot(outright, 'city.market')?.name).toBe('market')
  })

  /** Nobody's map is not somebody else's: the game keeps showing what it had. */
  it('answers nothing for a knot no map claims', () => {
    expect(mapForKnot(doc, 'the_wilds')).toBeNull()
  })
})
