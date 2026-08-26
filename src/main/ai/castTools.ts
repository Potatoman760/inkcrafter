import {
  emptyNpcs,
  inkKey,
  npcName,
  npcVar,
  type Npc,
  type NpcDocument,
  type NpcFlag,
  type NpcStat,
  type NpcStatus
} from '@shared/bundle/npcDoc'
import { newId } from '@shared/ids'
import {
  addAsset,
  addVariant,
  assetsOfKind,
  mediaName,
  newAsset,
  newVariant,
  updateVariant,
  type MediaAsset
} from '@shared/mediaDoc'
import { readMedia, scanMedia, writeMedia } from '../media'
import { readNpcs, writeNpcs } from '../npcs'
import { INVENTORY } from '@shared/statsDoc'
import { readStats } from '../stats'
import { asText, needProject, projectFolder } from './toolInput'
import type { ToolDefinition, ToolResult } from './workspaceTools'

/**
 * The cast catalogue, for the same reason `write_variables` exists.
 *
 * Every attribute becomes one ink global named `<inkId>_<key>`, declared in a
 * generated `ink/state.ink`. A model that writes `npcs.json` with `write_file`
 * gets a file the app will happily show and a story that cannot see a word of
 * it — no `VAR` is declared, so every `{maren_trust >= 3}` fails to compile,
 * and nothing anywhere says why. `writeNpcs` regenerates the declarations from
 * both catalogues at once, which is the whole reason to route through here.
 *
 * Merges by ink id, like the other catalogue tools. There is no undo in this
 * workspace, and a model that mentions a character while adding one attribute
 * must not thereby delete the other six.
 *
 * Their sprites come through here too, because a character is one thing: the
 * media catalogue has no character tab, and a character asset nothing in the
 * cast points at is one nothing in the app can reach. `write_media` refuses
 * them and names this tool.
 */

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

/* Attributes ---------------------------------------------------------------- */

function readStat(value: unknown): NpcStat | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  const min = asNumber(record['min'], 0)
  const max = Math.max(min, asNumber(record['max'], 10))
  const initial = asNumber(record['initial'], min)

  return {
    key,
    label: asText(record['label']) || key,
    // Clamped rather than refused: a starting value outside its own range is a
    // slip, and the range is the thing the author actually meant.
    initial: Math.min(max, Math.max(min, initial)),
    min,
    max
  }
}

function readStatus(value: unknown): NpcStatus | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  const values = asStringList(record['values'])
  const initial = asText(record['initial']).trim()

  // A status with no permitted words can never be set to anything, so the
  // initial value stands as the one member rather than leaving it unusable.
  const all = values.length > 0 ? values : initial.length > 0 ? [initial] : []
  if (all.length === 0) return null

  return {
    key,
    label: asText(record['label']) || key,
    initial: all.includes(initial) ? initial : all[0]!,
    values: all
  }
}

function readFlag(value: unknown): NpcFlag | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  return { key, label: asText(record['label']) || key, initial: record['initial'] === true }
}

interface LookInput {
  name: string
  file: string
}

function readLookInput(value: unknown): LookInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const file = asText(record['file']).trim().replace(/^\/+/, '')
  if (file.length === 0) return null

  // A look with no name is the default one, which is what a bare `# char: maren`
  // resolves to.
  return { name: mediaName(asText(record['name'])), file }
}

interface CastInput {
  inkId: string
  name: string
  sprite: string
  looks: LookInput[]
  stats: NpcStat[]
  statuses: NpcStatus[]
  flags: NpcFlag[]
  /** Which attribute lists the model actually sent, so merging can tell "none" from "unchanged". */
  sent: { stats: boolean; statuses: boolean; flags: boolean }
}

function readCastInput(value: unknown): CastInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = asText(record['name']).trim()
  const inkId = npcName(asText(record['ink_id']) || name)
  if (inkId.length === 0) return null

  const list = <T>(key: string, read: (one: unknown) => T | null): T[] =>
    Array.isArray(record[key])
      ? (record[key] as unknown[]).map(read).filter((one): one is T => one !== null)
      : []

  return {
    inkId,
    name: name || inkId,
    sprite: npcName(asText(record['sprite'])),
    looks: list('looks', readLookInput),
    stats: list('stats', readStat),
    statuses: list('statuses', readStatus),
    flags: list('flags', readFlag),
    sent: {
      stats: Array.isArray(record['stats']),
      statuses: Array.isArray(record['statuses']),
      flags: Array.isArray(record['flags'])
    }
  }
}

/**
 * Merges one list of attributes by key: a key already there is updated, a new
 * one appended, and anything not mentioned left alone.
 */
function mergeAttrs<T extends { key: string }>(existing: T[], incoming: T[]): T[] {
  const merged = [...existing]
  for (const attr of incoming) {
    const at = merged.findIndex((one) => one.key === attr.key)
    if (at === -1) merged.push(attr)
    else merged[at] = attr
  }
  return merged
}

interface MergeReport {
  doc: NpcDocument
  added: boolean
  newAttrs: number
}

function mergeNpc(doc: NpcDocument, input: CastInput): MergeReport {
  const existing = doc.npcs.find((npc) => npc.inkId === input.inkId)

  const stats = mergeAttrs(existing?.stats ?? [], input.stats)
  const statuses = mergeAttrs(existing?.statuses ?? [], input.statuses)
  const flags = mergeAttrs(existing?.flags ?? [], input.flags)

  const before =
    (existing?.stats.length ?? 0) + (existing?.statuses.length ?? 0) + (existing?.flags.length ?? 0)
  const newAttrs = stats.length + statuses.length + flags.length - before

  const npc: Npc = {
    // `med` because that is what the cast panel mints (CastPanel.tsx), odd as
    // the prefix reads for a person. Nothing parses it — an NPC is found by
    // inkId, and this only has to be unique and stable — and one convention
    // written in two places beats two conventions.
    id: existing?.id ?? newId('med'),
    inkId: input.inkId,
    name: input.name,
    // An omitted sprite means "leave it", not "clear it" — a model adding one
    // attribute should not detach the character's artwork.
    sprite: input.sprite || existing?.sprite || '',
    stats,
    statuses,
    flags
  }

  return {
    doc: {
      ...doc,
      npcs: existing
        ? doc.npcs.map((one) => (one.inkId === existing.inkId ? npc : one))
        : [...doc.npcs, npc]
    },
    added: existing === undefined,
    newAttrs
  }
}

/* The tool ------------------------------------------------------------------ */

const ATTR_KEY = 'The attribute key, which becomes part of the ink variable name and keeps its case.'

export const writeCastTool: ToolDefinition = {
  name: 'write_cast',
  description:
    'Add or update the cast of the open project — the characters, the state the story tracks about them, and their sprites. Use this rather than writing npcs.json with write_file: every attribute becomes an ink VAR in a generated ink/state.ink that only this regenerates, so a hand-written cast declares nothing and every condition on it fails to compile. Their pictures come through here too rather than write_media, because a character is one thing. This is not the codex: a codex entry is prose about who someone is, a cast member is state the story can branch on. Merges with what is there, so send only what is new or changed.',
  parameters: {
    type: 'object',
    properties: {
      cast: {
        type: 'array',
        description: 'The characters to add or update.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'What a reader sees, e.g. "Maren".' },
            ink_id: {
              type: 'string',
              description:
                'lower_snake_case identifier, e.g. "maren". Variables are <ink_id>_<key>. Defaults to the name.'
            },
            sprite: {
              type: 'string',
              description:
                'The tag name for their pictures, e.g. "maren" in "# char: maren/happy". Defaults to their ink_id. Only matters if they appear on screen.'
            },
            looks: {
              type: 'array',
              description:
                'Their sprites — one per expression. You cannot create the image files; list the project’s media/ folder and use the paths that are there. Omit for someone the story tracks but never shows.',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'The expression, e.g. "happy". Omit for the default one.'
                  },
                  file: {
                    type: 'string',
                    description: 'Path under the project’s media/, e.g. "sprites/maren-happy.png".'
                  }
                },
                required: ['file']
              }
            },
            stats: {
              type: 'array',
              description: 'Numbers with a floor and a ceiling — trust, affection, suspicion.',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: ATTR_KEY },
                  label: { type: 'string', description: 'What an author sees in the cast panel.' },
                  initial: { type: 'number' },
                  min: { type: 'number', description: 'Defaults to 0.' },
                  max: { type: 'number', description: 'Defaults to 10.' }
                },
                required: ['key']
              }
            },
            statuses: {
              type: 'array',
              description: 'One of a fixed set of words — a relationship, a rank, a mood.',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: ATTR_KEY },
                  label: { type: 'string' },
                  values: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Every word it may hold. Required: a status with no words is dropped.'
                  },
                  initial: { type: 'string', description: 'One of values. Defaults to the first.' }
                },
                required: ['key', 'values']
              }
            },
            flags: {
              type: 'array',
              description: 'True or false — whether they know, whether they have left.',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: ATTR_KEY },
                  label: { type: 'string' },
                  initial: { type: 'boolean', description: 'Defaults to false.' }
                },
                required: ['key']
              }
            }
          },
          required: ['name']
        }
      }
    },
    required: ['cast']
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    const inputs = Array.isArray(args['cast'])
      ? args['cast'].map(readCastInput).filter((one): one is CastInput => one !== null)
      : []

    if (inputs.length === 0) {
      return {
        ok: false,
        summary: 'write_cast — nothing usable',
        content:
          'No usable cast members. Each needs a name, and each attribute needs a key. A status also needs its list of permitted values.'
      }
    }

    let doc = (await readNpcs(project)) ?? emptyNpcs()
    let added = 0
    let newAttrs = 0

    for (const input of inputs) {
      const result = mergeNpc(doc, input)
      doc = result.doc
      newAttrs += result.newAttrs
      if (result.added) added++
    }

    // The sprites, filed against the character asset each person's `sprite`
    // names — minted here when they do not have one yet, so a look never lands
    // somewhere nothing in the app can reach.
    const sprites = await fileLooks(project, doc, inputs)
    doc = sprites.doc

    const { written } = await writeNpcs(project, doc)
    for (const path of written) context.written.push(`${projectFolder(project)}/${path}`)
    if (sprites.wroteMedia) context.written.push(`${projectFolder(project)}/media.json`)

    // Named after the fact, because the whole point of this tool is that the
    // variables now exist and can be branched on — saying so is what tells the
    // model it does not need to declare them itself.
    const sample = doc.npcs
      .flatMap((npc) => npc.stats.slice(0, 1).map((stat) => npcVar(npc.inkId, stat.key)))
      .slice(0, 3)

    const clash = await collidingNames(project, doc)

    return {
      ok: (added > 0 || newAttrs > 0 || sprites.newLooks > 0) && sprites.missing.length === 0,
      summary:
        `cast: +${added} character${added === 1 ? '' : 's'}, +${newAttrs} attribute${newAttrs === 1 ? '' : 's'}` +
        (sprites.newLooks > 0 ? `, +${sprites.newLooks} look${sprites.newLooks === 1 ? '' : 's'}` : ''),
      content:
        `The cast now holds ${doc.npcs.length} character(s). Declarations were regenerated into ` +
        `ink/state.ink, so the story can use them now${sample.length > 0 ? `: {${sample[0]} >= 3} to gate on one, "# npc: ${doc.npcs[0]?.inkId} ${doc.npcs[0]?.stats[0]?.key ?? 'key'} += 1" to move it` : ''}.` +
        (clash.length > 0
          ? ` Warning: ${clash.join(', ')} ${clash.length === 1 ? 'is' : 'are'} also declared by stats.json. Rename one side or the declarations collide.`
          : '') +
        (sprites.missing.length > 0
          ? ` These looks name a file that is not in media/, so they will show nothing: ${sprites.missing.join(', ')}. List media/ and use the paths that are there.`
          : '')
    }
  }
}

/**
 * Ink names claimed by both catalogues.
 *
 * They share one namespace in the generated file, and a collision there is a
 * compile error a long way from its cause — worth naming while the model is
 * still holding the thing it just wrote.
 */
async function collidingNames(
  project: Parameters<typeof readStats>[0],
  doc: NpcDocument
): Promise<string[]> {
  const stats = await readStats(project)
  const taken = new Set([
    ...stats.stats.map((stat) => stat.name),
    ...stats.items.map((item) => item.name),
    INVENTORY
  ])

  return doc.npcs
    .flatMap((npc) => [
      ...npc.stats.map((one) => npcVar(npc.inkId, one.key)),
      ...npc.statuses.map((one) => npcVar(npc.inkId, one.key)),
      ...npc.flags.map((one) => npcVar(npc.inkId, one.key))
    ])
    .filter((name) => taken.has(name))
}

interface LooksReport {
  doc: NpcDocument
  wroteMedia: boolean
  newLooks: number
  missing: string[]
}

/**
 * Files each person's looks against their character asset, minting one where
 * they have none.
 *
 * The asset is named after their ink id rather than sharing it — the two are
 * separate fields, and forcing them equal would rewrite the tag name every time
 * a variable was renamed, breaking `# char:` lines already in the story. Naming
 * them the same *on creation* is enough to make them agree in practice, which
 * is exactly what the cast screen does.
 */
async function fileLooks(
  project: Parameters<typeof readMedia>[0],
  doc: NpcDocument,
  inputs: CastInput[]
): Promise<LooksReport> {
  const wanted = inputs.filter((input) => input.looks.length > 0)
  if (wanted.length === 0) return { doc, wroteMedia: false, newLooks: 0, missing: [] }

  let media = await readMedia(project)
  let newLooks = 0
  let npcs = doc

  for (const input of wanted) {
    const npc = npcs.npcs.find((one) => one.inkId === input.inkId)
    if (!npc) continue

    const name = npc.sprite || mediaName(input.sprite) || npc.inkId
    let asset: MediaAsset | undefined = assetsOfKind(media, 'character').find(
      (one) => one.name === name
    )

    if (!asset) {
      asset = { ...newAsset(npc.name || name, 'character'), name }
      media = addAsset(media, asset)
    }

    // Pointing them at it is what makes the tag reachable from the app: the
    // cast screen finds a character's pictures through this name and nothing
    // else.
    if (npc.sprite !== name) {
      npcs = {
        ...npcs,
        npcs: npcs.npcs.map((one) => (one.inkId === npc.inkId ? { ...one, sprite: name } : one))
      }
    }

    for (const look of input.looks) {
      const existing = asset.variants.find((one) => one.name === look.name)
      media = existing
        ? updateVariant(media, asset.id, existing.id, { file: look.file })
        : addVariant(media, asset.id, newVariant(look.name, look.file))
      if (!existing) newLooks++
      asset = assetsOfKind(media, 'character').find((one) => one.id === asset!.id)!
    }
  }

  await writeMedia(project, media)

  const onDisk = new Set((await scanMedia(project)).map((file) => file.path))
  const missing = media.assets
    .filter((one) => one.kind === 'character')
    .flatMap((one) =>
      one.variants
        .filter((variant) => !onDisk.has(variant.file))
        .map((variant) => `${one.name}${variant.name ? `/${variant.name}` : ''} → ${variant.file}`)
    )
    .slice(0, 12)

  return { doc: npcs, wroteMedia: true, newLooks, missing }
}
