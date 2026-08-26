/**
 * The cast, as state the story can move.
 *
 * A codex entry says who someone *is*; this says what the story is *tracking*
 * about them — how much they like you, whether you are married, whether they
 * know. Different things, deliberately kept apart: a codex entry is prose for
 * an author and a model to read, and none of it reaches the ink.
 *
 * Every attribute becomes one ink global named `<id>_<key>`, which is what makes
 * this work at all. The story can branch on them, tags can move them, and
 * because they are ordinary variables they serialise into a save for free —
 * a game reloading ink state gets the whole cast back without doing anything.
 *
 * Three kinds, because a visual novel keeps three kinds of thing about a person
 * and flattening them into "a number" loses the check that makes each safe:
 * a *stat* is a number with a floor and a ceiling, a *status* is one of a fixed
 * set of words, and a *flag* is true or false.
 */

export interface NpcStat {
  key: string
  label: string
  initial: number
  min: number
  max: number
}

export interface NpcStatus {
  key: string
  label: string
  initial: string
  /** The words this may hold. An assignment outside the set is refused. */
  values: string[]
}

export interface NpcFlag {
  key: string
  label: string
  initial: boolean
}

export interface Npc {
  /** `npc_…`. Stable across renames. */
  id: string
  /** The ink identifier: variables are `<inkId>_<key>`. */
  inkId: string
  /** Shown to a reader. */
  name: string
  /** A `character` media asset's name, or empty — a tracked NPC need not appear. */
  sprite: string
  stats: NpcStat[]
  statuses: NpcStatus[]
  flags: NpcFlag[]
}

export interface NpcDocument {
  version: 1
  npcs: Npc[]
}

export function emptyNpcs(): NpcDocument {
  return { version: 1, npcs: [] }
}

/** The ink global backing an attribute. One definition, both applications. */
export function npcVar(inkId: string, key: string): string {
  return `${inkId}_${key}`
}

/** Every ink name this document occupies, for checking a stat does not collide. */
export function npcVarNames(doc: NpcDocument): string[] {
  return doc.npcs.flatMap((npc) => [
    ...npc.stats.map((stat) => npcVar(npc.inkId, stat.key)),
    ...npc.statuses.map((status) => npcVar(npc.inkId, status.key)),
    ...npc.flags.map((flag) => npcVar(npc.inkId, flag.key))
  ])
}

/** Every attribute of one NPC, as `id.key`, for validating an `# npc:` tag. */
export function npcAttrNames(doc: NpcDocument): string[] {
  return doc.npcs.flatMap((npc) => [
    ...npc.stats.map((stat) => `${npc.inkId}.${stat.key}`),
    ...npc.statuses.map((status) => `${npc.inkId}.${status.key}`),
    ...npc.flags.map((flag) => `${npc.inkId}.${flag.key}`)
  ])
}

export function findNpc(doc: NpcDocument, inkId: string): Npc | null {
  return doc.npcs.find((npc) => npc.inkId === inkId) ?? null
}

/**
 * The character sprite a `# speaker:` label refers to, or null for nobody.
 *
 * A speaker carries free text — it is written to be read, not looked up — and a
 * story writes `Narrator` and `Sister Abeline` for a cast whose sprite is
 * catalogued as `abeline`. So this matches loosely and gives up quietly: a label
 * naming nobody means nobody in particular is speaking, which is exactly what
 * `Narrator` should mean and must never be an error.
 *
 * The display name goes first because that is what a speaker tag nearly always
 * spells; the ink id and the sprite name follow, so a story whose cast list was
 * never filled in still works if it writes `# speaker: kael`.
 */
export function spriteForSpeaker(doc: NpcDocument, speaker: string): string | null {
  const wanted = speaker.trim().toLowerCase()
  if (wanted.length === 0) return null

  const npc = doc.npcs.find(
    (one) =>
      one.name.toLowerCase() === wanted ||
      one.inkId.toLowerCase() === wanted ||
      (one.sprite.length > 0 && one.sprite.toLowerCase() === wanted)
  )

  // Somebody tracked but never drawn — a voice off stage — has no sprite to lean
  // on, and pretending otherwise would light up whoever happens to be standing
  // under their name.
  return npc && npc.sprite.length > 0 ? npc.sprite : null
}

/** What kind of attribute this is, or null when the NPC has no such key. */
export function attrKind(npc: Npc, key: string): 'stat' | 'status' | 'flag' | null {
  if (npc.stats.some((one) => one.key === key)) return 'stat'
  if (npc.statuses.some((one) => one.key === key)) return 'status'
  if (npc.flags.some((one) => one.key === key)) return 'flag'
  return null
}

/* Persistence. Tolerant, like the other documents: a malformed entry is dropped
   rather than allowed to take the whole catalogue down with it. */

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * An NPC's ink identifier, from their name. Same rules as a media name — lower
 * case, because it is derived from prose and needs to land somewhere
 * predictable.
 */
export function npcName(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

/**
 * An attribute key, which keeps the case it was typed in.
 *
 * Unlike an id, a key is not derived from prose — an author writes it directly,
 * into the catalogue and then into `# npc: abeline isPregnant = true`. Folding
 * it to lower case would silently stop that tag matching, which is precisely
 * the class of failure this whole catalogue exists to make impossible.
 */
export function inkKey(text: string): string {
  const cleaned = text
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

function asStat(value: unknown): NpcStat | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  const min = asNumber(record['min'], 0)
  const max = asNumber(record['max'], 10)

  return {
    key,
    label: asText(record['label']) || key,
    initial: asNumber(record['initial'], min),
    min,
    // A ceiling below the floor would make every assignment fail silently.
    max: Math.max(min, max)
  }
}

function asStatus(value: unknown): NpcStatus | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  const values = Array.isArray(record['values'])
    ? record['values'].filter((one): one is string => typeof one === 'string' && one.length > 0)
    : []

  // A status with no permitted words can never be set to anything, so the
  // initial value is kept as the one member rather than leaving it unusable.
  const initial = asText(record['initial'])
  const all = values.length > 0 ? values : initial.length > 0 ? [initial] : []

  return {
    key,
    label: asText(record['label']) || key,
    initial: all.includes(initial) ? initial : (all[0] ?? ''),
    values: all
  }
}

function asFlag(value: unknown): NpcFlag | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  return {
    key,
    label: asText(record['label']) || key,
    initial: record['initial'] === true
  }
}

function asNpc(value: unknown): Npc | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const inkId = npcName(asText(record['inkId']) || asText(record['name']))
  if (inkId.length === 0) return null

  const list = <T>(key: string, read: (one: unknown) => T | null): T[] =>
    Array.isArray(record[key])
      ? (record[key] as unknown[]).map(read).filter((one): one is T => one !== null)
      : []

  return {
    id: asText(record['id']),
    inkId,
    name: asText(record['name']) || inkId,
    sprite: npcName(asText(record['sprite'])),
    stats: list('stats', asStat),
    statuses: list('statuses', asStatus),
    flags: list('flags', asFlag)
  }
}

export function parseNpcs(json: string): NpcDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyNpcs()
    const record = parsed as Record<string, unknown>

    return {
      version: 1,
      npcs: Array.isArray(record['npcs'])
        ? record['npcs'].map(asNpc).filter((npc): npc is Npc => npc !== null)
        : []
    }
  } catch {
    return emptyNpcs()
  }
}

export function serialiseNpcs(doc: NpcDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
