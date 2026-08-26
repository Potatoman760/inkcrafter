import { newId } from '../ids'
import type { Condition } from './condition'

/**
 * The maps: places the reader can travel to, and when.
 *
 * A visual novel that is only a line of text does not need one. The moment it
 * has a hub — a map, a set of rooms, anywhere the reader chooses where to go
 * rather than what to say — it needs somewhere to record which knot each place
 * is, where its hotspot sits, and what has to be true before it opens. That is
 * all this is.
 *
 * Travel is a *divert*, not a choice: the game calls `ChoosePathString`, which
 * resets the callstack. So a destination has to be a knot that stands on its
 * own — one that sets its own background and speaker rather than assuming what
 * came before it.
 *
 * There are several maps, and a hotspot may open one instead of travelling: an
 * overworld whose city gate opens the city, and a city whose road out opens the
 * overworld again. A flat list rather than a hierarchy — nothing here is
 * anyone's parent, so a continent holding regions holding cities costs nothing
 * extra and needs no field to keep in step.
 *
 * Which map the reader is looking at is a fact about *where they are in the
 * story*, so each map names the knots it belongs to rather than the ink naming
 * the map. A knot nobody claims leaves the map alone, which is what keeps those
 * lists short: only the knots where the map changes have to be listed.
 */

/**
 * Where a hotspot goes.
 *
 * One object rather than two fields beside each other, so the kind and the name
 * cannot be patched apart — `to: 'map'` holding a knot name is a place that
 * goes nowhere, and both the editor and the assistant's tool write changes a
 * field at a time.
 */
export interface MapDestination {
  to: 'knot' | 'map'
  /** A knot or `knot.stitch` to divert to, or another map's `name` to open. */
  name: string
}

export interface MapLocation {
  /** `loc_…`; stable across renames. */
  id: string
  /** Shown on the hotspot. */
  label: string
  /** Hotspot centre, in the coordinate space `size` describes. */
  x: number
  y: number
  width: number
  height: number
  destination: MapDestination
  /** null means always open. */
  available: Condition | null
  /** Shown when locked. Empty falls back to describing the condition. */
  lockedHint: string
  /**
   * A `hotspot` media asset drawn in place of a plain rectangle, or empty.
   *
   * The asset's looks are the states — `idle`, `hover`, `active`, `disabled` —
   * so one name carries all four. They are all one picture at four moments, so
   * they are all the same size, and the hotspot takes that shape: see
   * `fitToAspect`.
   */
  art: string
}

/** One map: a picture, the space it is drawn in, and what is on it. */
export interface MapArea {
  /** `map_…`. Stable across renames. */
  id: string
  /** What a `to: 'map'` destination names. Never written in ink. */
  name: string
  /** Player-facing. Empty falls back to `name`. */
  display: string
  /** A `background` asset's name to draw under the hotspots, or empty for none. */
  image: string
  /**
   * The space `x`, `y`, `width` and `height` are expressed in.
   *
   * Held rather than assumed so the map can be laid out against its picture at
   * whatever size that picture is, and scaled by whatever draws it.
   */
  size: { width: number; height: number }
  /**
   * The knots this map is the default for. A knot claims its stitches too, so
   * `city` covers `city.market` without listing it.
   *
   * A knot nobody claims leaves the showing map alone rather than falling back,
   * so only the knots where the map *changes* need to be here — the city gate
   * and the road out, not the thirty scenes between them.
   */
  knots: string[]
  locations: MapLocation[]
}

export interface MapDocument {
  version: 2
  maps: MapArea[]
}

export function emptyMap(): MapDocument {
  return { version: 2, maps: [] }
}

/** The space a map is drawn in until a picture says otherwise. */
const DEFAULT_SIZE = { width: 1280, height: 720 } as const

/**
 * A map's name, as an identifier rather than a sentence.
 *
 * Its own slug rather than a shared one, like every other catalogue here: they
 * are free to diverge, and a map's name has no ink to be safe for — nothing
 * writes it into a story. It is slugged anyway because it is typed into
 * `map.json` by hand and by the assistant, where `the keep` and `The Keep`
 * being two different maps would be a bad afternoon.
 */
export function mapName(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

export function newMapArea(name: string): MapArea {
  return {
    id: newId('map'),
    name: mapName(name),
    display: name.trim(),
    image: '',
    size: { ...DEFAULT_SIZE },
    knots: [],
    locations: []
  }
}

/**
 * Why this map cannot be called that, or null when it can.
 *
 * `exceptId` lets a map keep its own name while being renamed, which is
 * otherwise reported as colliding with itself.
 */
export function mapNameProblem(
  doc: MapDocument,
  name: string,
  exceptId?: string
): string | null {
  const cleaned = mapName(name)
  if (cleaned.length === 0) return 'A name needs at least one letter or digit.'

  const clash = doc.maps.find((map) => map.name === cleaned && map.id !== exceptId)
  return clash ? `There is already a map called ${cleaned}.` : null
}

/** The map a `to: 'map'` destination names, or null when nothing does. */
export function findMap(doc: MapDocument, name: string): MapArea | null {
  return doc.maps.find((map) => map.name === name) ?? null
}

/**
 * The map a knot belongs to, or null when no map claims it.
 *
 * A stitch inherits from its knot, so claiming `city` is enough for
 * `city.market`. Written here rather than in each caller because preflight, the
 * editor and the game all have to agree about it — and the game is a separate
 * program, so this is the thing its own copy has to match.
 */
export function mapForKnot(doc: MapDocument, knot: string): MapArea | null {
  const bare = knot.split('.')[0]!
  return (
    doc.maps.find((map) => map.knots.includes(knot)) ??
    doc.maps.find((map) => map.knots.includes(bare)) ??
    null
  )
}

/* Operations. Each returns a whole new document; none mutates. */

export function updateMap(doc: MapDocument, id: string, changes: Partial<MapArea>): MapDocument {
  return { ...doc, maps: doc.maps.map((map) => (map.id === id ? { ...map, ...changes } : map)) }
}

export function updateLocation(
  doc: MapDocument,
  mapId: string,
  locationId: string,
  changes: Partial<MapLocation>
): MapDocument {
  return updateMap(doc, mapId, {
    locations:
      doc.maps
        .find((map) => map.id === mapId)
        ?.locations.map((one) => (one.id === locationId ? { ...one, ...changes } : one)) ?? []
  })
}

/**
 * Renames a map and repoints every hotspot that opened it.
 *
 * Maps are named rather than referenced by id — the same way art, pictures and
 * knots are named throughout this file — so a rename has to follow its own
 * references or quietly break the links into it.
 */
export function renameMap(doc: MapDocument, id: string, name: string): MapDocument {
  const from = doc.maps.find((map) => map.id === id)
  const to = mapName(name)
  if (!from || to.length === 0 || to === from.name) return doc

  return {
    ...doc,
    maps: doc.maps.map((map) => ({
      ...(map.id === id ? { ...map, name: to } : map),
      locations: map.locations.map((location) =>
        location.destination.to === 'map' && location.destination.name === from.name
          ? { ...location, destination: { to: 'map' as const, name: to } }
          : location
      )
    }))
  }
}

/** Every map that opens `name`, so removing one can say what it would break. */
export function mapsLinkingTo(doc: MapDocument, name: string): MapArea[] {
  return doc.maps.filter(
    (map) =>
      map.name !== name &&
      map.locations.some(
        (location) => location.destination.to === 'map' && location.destination.name === name
      )
  )
}

/** The default hotspot, sized for a label rather than for a landmark. */
export const DEFAULT_HOTSPOT = { width: 230, height: 64 } as const

/* Geometry ------------------------------------------------------------------
 *
 * A location is stored as a centre and a size, because that is what a hotspot
 * *is* — a place with an extent. Drawing and resizing are about edges, though:
 * dragging the west handle moves one edge and leaves the other three alone,
 * which is nothing like an operation on a centre.
 *
 * So both spellings exist and these convert between them. They are here rather
 * than in the panel because they are arithmetic about the document, they have
 * every off-by-one that matters, and none of it needs a DOM to test.
 */

/** A location as its four edges, in map units. */
export interface MapRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The smallest a hotspot may be, in map units.
 *
 * Not zero: a rectangle dragged past its own opposite edge would invert, and a
 * zero-width one is invisible and unselectable — a place that exists in the
 * file and nowhere on the picture.
 */
export const MIN_HOTSPOT = 8

export function rectOf(box: { x: number; y: number; width: number; height: number }): MapRect {
  return {
    left: box.x - box.width / 2,
    top: box.y - box.height / 2,
    right: box.x + box.width / 2,
    bottom: box.y + box.height / 2
  }
}

/** Back to the centre-and-size the document stores, rounded to whole units. */
export function boxOf(rect: MapRect): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round((rect.left + rect.right) / 2),
    y: Math.round((rect.top + rect.bottom) / 2),
    width: Math.round(rect.right - rect.left),
    height: Math.round(rect.bottom - rect.top)
  }
}

/** Two corners in any order into a rectangle. Drawing goes in all four directions. */
export function rectBetween(
  a: { x: number; y: number },
  b: { x: number; y: number }
): MapRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y)
  }
}

/** Which edges a handle moves. A corner moves two, an edge one. */
export type MapHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const MAP_HANDLES: readonly MapHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * The rectangle after one handle is dragged to a point.
 *
 * The opposite edges do not move, which is the whole contract of a handle:
 * widening a mountain range from the east must not walk its western edge.
 * Dragging an edge past its opposite swaps them rather than inverting, so a
 * rectangle pulled inside out stays a rectangle.
 */
export function resizeRect(rect: MapRect, handle: MapHandle, to: { x: number; y: number }): MapRect {
  const next = { ...rect }

  if (handle.includes('w')) next.left = to.x
  if (handle.includes('e')) next.right = to.x
  if (handle.includes('n')) next.top = to.y
  if (handle.includes('s')) next.bottom = to.y

  return {
    left: Math.min(next.left, next.right),
    right: Math.max(next.left, next.right),
    top: Math.min(next.top, next.bottom),
    bottom: Math.max(next.top, next.bottom)
  }
}

/**
 * The rectangle at a given aspect, anchored where the drag is not.
 *
 * Art for a hotspot is one picture, so the box that draws it has to be that
 * picture's shape or the art is stretched. The edge being dragged is the one
 * the author is looking at, so it is the one that is honoured: dragging east
 * sets the width and the height follows, dragging a corner takes whichever of
 * the two moved further.
 */
export function fitToAspect(rect: MapRect, aspect: number, handle: MapHandle | null): MapRect {
  if (!Number.isFinite(aspect) || aspect <= 0) return rect

  const width = rect.right - rect.left
  const height = rect.bottom - rect.top

  // Which dimension the gesture is really about. A corner drag has moved both,
  // so the one that changed proportionally more is the one meant.
  const horizontal =
    handle === 'e' || handle === 'w'
      ? true
      : handle === 'n' || handle === 's'
        ? false
        : width / aspect >= height

  const next = horizontal
    ? { width, height: width / aspect }
    : { width: height * aspect, height }

  // The corner opposite the handle stays put; with no handle the centre does.
  const west = handle?.includes('w') ?? false
  const north = handle?.includes('n') ?? false

  if (handle === null) {
    const midX = (rect.left + rect.right) / 2
    const midY = (rect.top + rect.bottom) / 2
    return {
      left: midX - next.width / 2,
      right: midX + next.width / 2,
      top: midY - next.height / 2,
      bottom: midY + next.height / 2
    }
  }

  return {
    left: west ? rect.right - next.width : rect.left,
    right: west ? rect.right : rect.left + next.width,
    top: north ? rect.bottom - next.height : rect.top,
    bottom: north ? rect.bottom : rect.top + next.height
  }
}

/**
 * A rectangle held inside the picture and above the minimum size.
 *
 * Clamped rather than refused: a drag that runs off the edge of the map should
 * stop at the edge, not stop responding.
 */
export function clampRect(rect: MapRect, size: { width: number; height: number }): MapRect {
  const left = Math.max(0, Math.min(rect.left, size.width - MIN_HOTSPOT))
  const top = Math.max(0, Math.min(rect.top, size.height - MIN_HOTSPOT))

  return {
    left,
    top,
    right: Math.min(size.width, Math.max(rect.right, left + MIN_HOTSPOT)),
    bottom: Math.min(size.height, Math.max(rect.bottom, top + MIN_HOTSPOT))
  }
}

/** A whole location moved so its centre lands on a point, kept on the picture. */
export function moveTo(
  location: MapLocation,
  to: { x: number; y: number },
  size: { width: number; height: number }
): { x: number; y: number } {
  return {
    x: Math.round(Math.max(location.width / 2, Math.min(size.width - location.width / 2, to.x))),
    y: Math.round(Math.max(location.height / 2, Math.min(size.height - location.height / 2, to.y)))
  }
}

/**
 * Every location rescaled from one coordinate space into another.
 *
 * Used when the picture's real size becomes the space — a place stays over the
 * same part of the drawing, because both spaces describe the same picture and
 * the ratio between them is all that changed.
 */
export function rescaleLocations(
  locations: MapLocation[],
  from: { width: number; height: number },
  to: { width: number; height: number }
): MapLocation[] {
  if (from.width === to.width && from.height === to.height) return locations
  if (from.width <= 0 || from.height <= 0) return locations

  const kx = to.width / from.width
  const ky = to.height / from.height

  return locations.map((location) => ({
    ...location,
    x: Math.round(location.x * kx),
    y: Math.round(location.y * ky),
    width: Math.max(MIN_HOTSPOT, Math.round(location.width * kx)),
    height: Math.max(MIN_HOTSPOT, Math.round(location.height * ky))
  }))
}

/* Persistence. Tolerant, like every other document reader here. */

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * A condition, or null.
 *
 * Validated by shape rather than trusted, because a hand-edited or
 * newer-than-us `map.json` reaching the evaluator as the wrong shape would
 * throw while a map was being drawn. Anything unrecognised becomes "no gate",
 * which leaves a place open — the failure that is visible and recoverable,
 * rather than one that silently hides part of the world.
 */
function asCondition(value: unknown): Condition | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  switch (record['op']) {
    case 'all':
    case 'any': {
      if (!Array.isArray(record['of'])) return null
      const of = record['of'].map(asCondition).filter((one): one is Condition => one !== null)
      return { op: record['op'], of }
    }
    case 'not': {
      const of = asCondition(record['of'])
      return of === null ? null : { op: 'not', of }
    }
    case 'compare': {
      const left = asTerm(record['left'])
      const right = record['right']
      const cmp = record['cmp']
      const knownCmp =
        cmp === '==' || cmp === '!=' || cmp === '<' || cmp === '<=' || cmp === '>' || cmp === '>='

      if (left === null || !knownCmp) return null
      if (typeof right !== 'number' && typeof right !== 'string' && typeof right !== 'boolean') {
        return null
      }

      return { op: 'compare', left, cmp, right }
    }
    default:
      return null
  }
}

function asTerm(value: unknown): Extract<Condition, { op: 'compare' }>['left'] | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  switch (record['source']) {
    case 'visits': {
      const path = asText(record['path'])
      return path.length > 0 ? { source: 'visits', path } : null
    }
    case 'stat': {
      const key = asText(record['key'])
      return key.length > 0 ? { source: 'stat', key } : null
    }
    case 'npcStat':
    case 'npcStatus':
    case 'npcFlag': {
      const npc = asText(record['npc'])
      const key = asText(record['key'])
      return npc.length > 0 && key.length > 0 ? { source: record['source'], npc, key } : null
    }
    default:
      return null
  }
}

/**
 * Where a hotspot goes, from either spelling.
 *
 * `legacy` is the bare `target` string a map written before there was more than
 * one map carries. Read here rather than in a migration pass so a file that is
 * half one shape and half the other — hand-edited, or written by an assistant
 * working from an old example — still comes back whole.
 */
function asDestination(value: unknown, legacy: unknown): MapDestination {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

  return {
    // Anything that is not the one other word is a knot: a destination whose
    // kind cannot be read is far likelier to be a knot than a map, and a wrong
    // guess towards `map` would make a place silently stop travelling.
    to: record['to'] === 'map' ? 'map' : 'knot',
    name: (asText(record['name']) || asText(legacy)).trim()
  }
}

function asLocation(value: unknown): MapLocation | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  // A place with nowhere to go is not a place; there is nothing sensible to do
  // when it is clicked. True of a map that names nothing as much as a knot.
  const destination = asDestination(record['destination'], record['target'])
  if (destination.name.length === 0) return null

  return {
    // A location with no id is one the panel cannot tell from another with no
    // id, and selection is by id.
    id: asText(record['id']) || newId('loc'),
    label: asText(record['label']) || destination.name,
    x: asNumber(record['x'], 0),
    y: asNumber(record['y'], 0),
    width: asNumber(record['width'], DEFAULT_HOTSPOT.width),
    height: asNumber(record['height'], DEFAULT_HOTSPOT.height),
    destination,
    art: asText(record['art']),
    available: asCondition(record['available']),
    lockedHint: asText(record['lockedHint'])
  }
}

/**
 * One map, from a record shaped like a map — or like the whole document, back
 * when the whole document was one.
 *
 * A map missing its name is renamed rather than dropped, which is the one place
 * this reader departs from its siblings. A minigame with no name is inert and
 * losing it costs nothing; a map with no name is still a picture somebody drew
 * places onto, and quietly discarding that is the worst thing this file could
 * do. The collision it may now cause is preflight's to report.
 */
function asMapArea(value: unknown, fallbackName: string): MapArea | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const size = (typeof record['size'] === 'object' && record['size'] !== null
    ? record['size']
    : {}) as Record<string, unknown>

  const display = asText(record['display'])

  return {
    id: asText(record['id']) || newId('map'),
    name: mapName(asText(record['name'])) || mapName(display) || fallbackName,
    display,
    image: asText(record['image']),
    size: {
      width: asNumber(size['width'], DEFAULT_SIZE.width),
      height: asNumber(size['height'], DEFAULT_SIZE.height)
    },
    knots: Array.isArray(record['knots'])
      ? [...new Set(record['knots'].map(asText).filter((knot) => knot.length > 0))]
      : [],
    locations: Array.isArray(record['locations'])
      ? record['locations'].map(asLocation).filter((one): one is MapLocation => one !== null)
      : []
  }
}

/**
 * Read a map document of either shape.
 *
 * The shape is detected from the structure rather than from `version`, because
 * nobody has ever typed that number by hand and the structure cannot lie. A
 * document written before there were several maps *is* one map, so it goes
 * through the same reader with a name supplied — which means its picture, its
 * space and every place on it survive by construction rather than by a field
 * list somebody has to remember to keep up to date.
 */
export function parseMap(json: string): MapDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyMap()
    const record = parsed as Record<string, unknown>

    if (Array.isArray(record['maps'])) {
      return {
        version: 2,
        maps: record['maps']
          .map((one, index) => asMapArea(one, index === 0 ? 'world' : `map_${index + 1}`))
          .filter((one): one is MapArea => one !== null)
      }
    }

    // The one-map shape. An image with no places still counts: it is a picture
    // somebody chose, and dropping it would lose that choice silently.
    if (Array.isArray(record['locations']) || asText(record['image']).length > 0) {
      const only = asMapArea({ display: 'World', ...record }, 'world')
      return { version: 2, maps: only === null ? [] : [only] }
    }

    return emptyMap()
  } catch {
    return emptyMap()
  }
}

export function serialiseMap(doc: MapDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
