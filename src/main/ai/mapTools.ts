import {
  DEFAULT_HOTSPOT,
  mapName,
  newMapArea,
  parseMap,
  type MapArea,
  type MapDocument,
  type MapLocation
} from '@shared/bundle/mapDoc'
import { newId } from '@shared/ids'
import { listDestinations, readMap, writeMap } from '../map'
import { asText, needProject, projectFolder } from './toolInput'
import type { ToolDefinition, ToolResult } from './workspaceTools'

/**
 * The maps.
 *
 * Nothing is generated from `map.json` — unlike the two catalogues, a map is
 * read only by the game, so a file write would produce a working map. This
 * exists for the other kind of silent failure: a hotspot whose destination is
 * not a real knot is a place the reader can click that goes nowhere, and
 * neither the compiler nor the app says a word about it, because a knot that
 * does not exist yet is a perfectly normal state for a map laid out early.
 *
 * So the tool scans the knots that actually exist and names the ones a location
 * points at but misses — and does the same for a place that opens another map,
 * against the maps that are actually there. Same for a gate the document reader
 * threw away: an unrecognised condition becomes "no gate", which leaves a place
 * standing open when the model believed it had locked it.
 *
 * Places merge by *(map, label)* rather than by label alone. A story with an
 * overworld and a city has a "Gate" on each, and merging on the label would
 * quietly move one onto the other.
 */

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * Somewhere to put a hotspot nobody placed.
 *
 * Down a diagonal rather than all on the same spot: a stack of hotspots at the
 * centre looks like one place, and the author would have to drag them apart
 * before seeing what they have.
 */
function defaultPosition(area: MapArea, index: number): { x: number; y: number } {
  const step = (index % 8) / 8
  return {
    x: Math.round(area.size.width * (0.2 + step * 0.6)),
    y: Math.round(area.size.height * (0.2 + step * 0.6))
  }
}

interface LocationInput {
  label: string
  to: 'knot' | 'map'
  target: string
  x: number | null
  y: number | null
  width: number
  height: number
  lockedHint: string
  available: unknown
  sentAvailable: boolean
}

function readLocationInput(value: unknown): LocationInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const label = asText(record['label']).trim()
  if (label.length === 0) return null

  const x = record['x']
  const y = record['y']

  return {
    label,
    // Anything but the one other word is a knot: the commoner kind, and the one
    // a model that has not read the schema closely will have meant.
    to: record['to'] === 'map' ? 'map' : 'knot',
    target: asText(record['target']).trim(),
    x: typeof x === 'number' && Number.isFinite(x) ? x : null,
    y: typeof y === 'number' && Number.isFinite(y) ? y : null,
    width: asNumber(record['width'], DEFAULT_HOTSPOT.width),
    height: asNumber(record['height'], DEFAULT_HOTSPOT.height),
    lockedHint: asText(record['locked_hint']),
    available: record['available'] ?? null,
    sentAvailable: 'available' in record && record['available'] !== null
  }
}

const TERM = {
  type: 'object',
  description:
    'What to look at: {"source":"stat","key":"resolve"}, {"source":"npcFlag","npc":"maren","key":"knows"}, {"source":"npcStat","npc":"maren","key":"trust"}, {"source":"npcStatus","npc":"maren","key":"standing"} or {"source":"visits","path":"the_door"}.',
  properties: {
    source: { type: 'string', enum: ['stat', 'npcStat', 'npcStatus', 'npcFlag', 'visits'] },
    key: { type: 'string' },
    npc: { type: 'string', description: 'The cast member’s ink id, for the npc sources.' },
    path: { type: 'string', description: 'The knot, for the visits source.' }
  },
  required: ['source']
}

/**
 * The gate, one level deep.
 *
 * `all` and `any` nest arbitrarily in the document, but a schema cannot say so
 * without recursing, and a JSON Schema that recurses is one many providers
 * quietly reject. One level covers "carrying the key and she trusts you", which
 * is the shape a map gate actually takes; anything deeper is still accepted at
 * runtime, because the document's own reader is what validates this.
 */
const CONDITION = {
  type: 'object',
  description:
    'When the place is open. Omit for always. A single test is {"op":"compare","left":<term>,"cmp":">=","right":3}; combine with {"op":"all","of":[…]} or {"op":"any","of":[…]}; negate with {"op":"not","of":<condition>}.',
  properties: {
    op: { type: 'string', enum: ['compare', 'all', 'any', 'not'] },
    left: TERM,
    cmp: { type: 'string', enum: ['==', '!=', '<', '<=', '>', '>='] },
    right: { description: 'A number, a string or true/false.' },
    of: { type: 'array', description: 'The conditions being combined, for all/any/not.' }
  },
  required: ['op']
}

export const writeMapTool: ToolDefinition = {
  name: 'write_map',
  description:
    'Add or update places on one of the open project’s maps — where the reader can travel, and what has to be true first. A project may have several maps that open each other: an overworld whose city gate opens the city, and a city whose road out opens the overworld again. Travel to a knot is a divert, so that knot must stand on its own and set its own scene rather than assuming what came before it. Checks every destination against the knots and maps that actually exist and tells you which are missing. Merges by label within the named map, so send only what is new or changed.',
  parameters: {
    type: 'object',
    properties: {
      map: {
        type: 'string',
        description:
          'Which map, e.g. "world" or "city". Created if there is no map by that name. Omit for the first map in the project.'
      },
      display: {
        type: 'string',
        description: 'What the reader is shown this map is called, e.g. "The City".'
      },
      image: {
        type: 'string',
        description: 'The name of a background media asset to draw under the hotspots.'
      },
      knots: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The knots this map is the map for. Arriving at one makes the reader see this map, and a knot covers its stitches. A knot no map lists leaves the map alone, so list only where it changes — the city gate, the road out.',
      },
      locations: {
        type: 'array',
        description: 'The places to add or update.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Shown on the hotspot, e.g. "The Archive".' },
            to: {
              type: 'string',
              enum: ['knot', 'map'],
              description:
                'What clicking it does: travel into the story, or open another map. Defaults to knot.'
            },
            target: {
              type: 'string',
              description:
                'The knot to divert to, e.g. "the_archive" — or, when "to" is "map", the name of the map to open.'
            },
            x: { type: 'number', description: 'Hotspot centre. Omit and one is chosen.' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            available: CONDITION,
            locked_hint: {
              type: 'string',
              description: 'What the reader is told while it is shut. Omit to describe the gate.'
            }
          },
          required: ['label', 'target']
        }
      }
    }
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    const inputs = Array.isArray(args['locations'])
      ? args['locations'].map(readLocationInput).filter((one): one is LocationInput => one !== null)
      : []

    const image = asText(args['image']).trim()
    const display = asText(args['display']).trim()
    const wanted = mapName(asText(args['map']))
    const claimed = Array.isArray(args['knots'])
      ? args['knots'].map((one) => asText(one).trim()).filter((one) => one.length > 0)
      : null

    if (inputs.length === 0 && image.length === 0 && display.length === 0 && claimed === null) {
      return {
        ok: false,
        summary: 'write_map — nothing usable',
        content: 'No usable places. Each needs a label and a target knot.'
      }
    }

    const current = await readMap(project)

    // Named but absent means "make it": a model asked for a city map should get
    // one rather than a refusal it has to work out how to act on.
    const existingArea =
      (wanted.length > 0
        ? current.maps.find((one) => one.name === wanted)
        : current.maps[0]) ?? null
    const area: MapArea =
      existingArea ?? { ...newMapArea(display || wanted || 'World'), name: wanted || 'world' }

    let locations = [...area.locations]
    let added = 0

    for (const input of inputs) {
      // Within this map only. Two maps may each have a "Gate", and merging on
      // the label alone would move one onto the other.
      const at = locations.findIndex(
        (one) => one.label.toLowerCase() === input.label.toLowerCase()
      )
      const existing = at === -1 ? null : locations[at]!
      const place = input.x !== null && input.y !== null
        ? { x: input.x, y: input.y }
        : existing
          ? { x: existing.x, y: existing.y }
          : defaultPosition(area, locations.length)

      const location: MapLocation = {
        id: existing?.id ?? newId('loc'),
        label: input.label,
        ...place,
        width: input.width,
        height: input.height,
        destination: {
          to: input.to,
          name: input.target || existing?.destination.name || ''
        },
        // An omitted gate means "leave it", not "throw it open".
        available: (input.sentAvailable ? input.available : existing?.available ?? null) as
          | MapLocation['available'],
        lockedHint: input.lockedHint || existing?.lockedHint || '',
        art: existing?.art ?? ''
      }

      if (existing) locations[at] = location
      else {
        locations = [...locations, location]
        added++
      }
    }

    const next: MapArea = {
      ...area,
      display: display || area.display,
      image: image || area.image,
      knots: claimed ?? area.knots,
      locations
    }

    // Round-tripped through the document's own reader rather than trusted: it is
    // what the app will apply, so anything it drops is dropped either way, and
    // this is the only place that can still say so.
    const candidate: MapDocument = {
      ...current,
      maps: existingArea
        ? current.maps.map((one) => (one.id === area.id ? next : one))
        : [...current.maps, next]
    }
    const doc = parseMap(JSON.stringify(candidate))
    const written = doc.maps.find((one) => one.name === next.name) ?? null

    await writeMap(project, doc)
    context.written.push(`${projectFolder(project)}/map.json`)

    const knots = new Set((await listDestinations(project)).map((one) => one.knot))
    const places = written?.locations ?? []

    const dangling = places
      .filter((one) =>
        one.destination.to === 'knot'
          ? one.destination.name.length === 0 || !knots.has(one.destination.name)
          : !doc.maps.some((map) => map.name === one.destination.name)
      )
      .map(
        (one) =>
          `${one.label} → ${one.destination.name || '(nothing)'}${
            one.destination.to === 'map' ? ' (a map)' : ''
          }`
      )

    const strayKnots = (written?.knots ?? []).filter((knot) => !knots.has(knot.split('.')[0]!))

    const ungated = inputs
      .filter((input) => input.sentAvailable)
      .filter((input) => {
        const one = places.find(
          (place) => place.label.toLowerCase() === input.label.toLowerCase()
        )
        return one?.available === null
      })
      .map((input) => input.label)

    const notes = [
      dangling.length > 0
        ? `These point at a knot or map that does not exist yet, so they go nowhere: ${dangling.join(', ')}. Write it, or fix the target.`
        : '',
      strayKnots.length > 0
        ? `This map says it is the map for ${strayKnots.join(', ')}, which the story does not have.`
        : '',
      ungated.length > 0
        ? `The gate on ${ungated.join(', ')} was not a shape the map understands and was dropped, so ${ungated.length === 1 ? 'that place stands' : 'those places stand'} open.`
        : ''
    ].filter(Boolean)

    const title = written?.display || written?.name || next.name
    return {
      ok: dangling.length === 0 && strayKnots.length === 0 && ungated.length === 0,
      summary: `map ${title}: +${added} place${added === 1 ? '' : 's'}, ${places.length} in all`,
      content: [`${title} now holds ${places.length} place(s).`, ...notes].join(' ')
    }
  }
}
