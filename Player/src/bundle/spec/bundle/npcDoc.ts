// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

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
 * a number has a floor and a ceiling, a word is one of a fixed set, and a
 * yes/no is true or false.
 *
 * One list holding all three, though, rather than three lists. They were three
 * for a while and it made the editor three sections that could not be ordered
 * against each other — "affection, then whether she knows, then her standing"
 * is one thought and was three places. The kind is a field, exactly as it is on
 * a player stat; see `StatKind`, whose three words these are.
 */

/** The same three words a player stat uses. Kept identical on purpose. */
export type NpcVarKind = 'number' | 'boolean' | 'text'

export const NPC_VAR_KINDS: readonly NpcVarKind[] = ['number', 'boolean', 'text']

export interface NpcVariable {
  key: string
  label: string
  kind: NpcVarKind
  /** Read according to `kind`: a number, true/false, or one of `values`. */
  initial: number | boolean | string
  /**
   * The floor and ceiling a number is clamped to.
   *
   * Kept whatever the kind, so switching a variable to a word and back does not
   * quietly lose the range somebody set. The same goes for `values`.
   */
  min: number
  max: number
  /** The words a `text` variable may hold. An assignment outside the set is refused. */
  values: string[]
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
  variables: NpcVariable[]
}

/** A new variable of one kind, with defaults that make it usable immediately. */
export function newNpcVariable(kind: NpcVarKind, key: string, label: string): NpcVariable {
  return {
    key,
    label,
    kind,
    initial: kind === 'number' ? 0 : kind === 'boolean' ? false : 'single',
    min: 0,
    max: 10,
    values: kind === 'text' ? ['single', 'married'] : []
  }
}

/**
 * The same variable read as another kind.
 *
 * Changing the kind has to change the starting value with it: `0` is not a word
 * and `single` is not a number, and leaving the old one would generate ink the
 * story could never set back. Everything else is left alone, so switching away
 * and back returns what was there.
 */
export function asKind(variable: NpcVariable, kind: NpcVarKind): NpcVariable {
  if (variable.kind === kind) return variable

  const initial =
    kind === 'number'
      ? Math.min(Math.max(Number(variable.initial) || 0, variable.min), variable.max)
      : kind === 'boolean'
        ? variable.initial === true
        : variable.values.includes(String(variable.initial))
          ? String(variable.initial)
          : (variable.values[0] ?? '')

  return { ...variable, kind, initial }
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
  return doc.npcs.flatMap((npc) =>
    npc.variables.map((variable) => npcVar(npc.inkId, variable.key))
  )
}

/** Every attribute of one NPC, as `id.key`, for validating an `# npc:` tag. */
export function npcAttrNames(doc: NpcDocument): string[] {
  return doc.npcs.flatMap((npc) =>
    npc.variables.map((variable) => `${npc.inkId}.${variable.key}`)
  )
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

/** The variable one of an NPC's keys names, or null when they have no such key. */
export function npcVariable(npc: Npc, key: string): NpcVariable | null {
  return npc.variables.find((one) => one.key === key) ?? null
}

/** What kind of variable this is, or null when the NPC has no such key. */
export function attrKind(npc: Npc, key: string): NpcVarKind | null {
  return npcVariable(npc, key)?.kind ?? null
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

/**
 * The floor, ceiling and word list a variable carries whatever its kind.
 *
 * Read for every kind rather than only the one that uses them, so a file whose
 * variable was a number yesterday still has its range when it is one again.
 */
function asRange(record: Record<string, unknown>): { min: number; max: number } {
  const min = asNumber(record['min'], 0)
  // A ceiling below the floor would make every assignment fail silently.
  return { min, max: Math.max(min, asNumber(record['max'], 10)) }
}

function asWords(record: Record<string, unknown>): string[] {
  return Array.isArray(record['values'])
    ? record['values'].filter((one): one is string => typeof one === 'string' && one.length > 0)
    : []
}

function asVariable(value: unknown, assume?: NpcVarKind): NpcVariable | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const key = inkKey(asText(record['key']))
  if (key.length === 0) return null

  const named = record['kind']
  const kind: NpcVarKind =
    named === 'number' || named === 'boolean' || named === 'text'
      ? named
      : // No kind, or one nobody recognises. `assume` is what the list it came
        // out of says it must be, back when there were three lists; a number is
        // the fallback otherwise, being the kind that reads most values.
        (assume ?? 'number')

  const { min, max } = asRange(record)
  const values = asWords(record)
  const raw = record['initial']

  const initial: NpcVariable['initial'] =
    kind === 'boolean'
      ? raw === true
      : kind === 'number'
        ? asNumber(raw, min)
        : // A word outside the permitted set could never be set back, so the
          // list wins — and a list nobody filled in takes the word as its one
          // member rather than leaving the variable unusable.
          values.includes(asText(raw))
          ? asText(raw)
          : (values[0] ?? asText(raw))

  return {
    key,
    label: asText(record['label']) || key,
    kind,
    initial,
    min,
    max,
    values: kind === 'text' && values.length === 0 && asText(raw).length > 0 ? [asText(raw)] : values
  }
}

function asNpc(value: unknown): Npc | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const inkId = npcName(asText(record['inkId']) || asText(record['name']))
  if (inkId.length === 0) return null

  const list = (key: string, assume?: NpcVarKind): NpcVariable[] =>
    Array.isArray(record[key])
      ? (record[key] as unknown[])
          .map((one) => asVariable(one, assume))
          .filter((one): one is NpcVariable => one !== null)
      : []

  // `variables` is the shape now. A file written when there were three lists is
  // read from those instead, in the order they were shown, so nothing an author
  // arranged is reordered under them.
  const variables = Array.isArray(record['variables'])
    ? list('variables')
    : [...list('stats', 'number'), ...list('statuses', 'text'), ...list('flags', 'boolean')]

  return {
    id: asText(record['id']),
    inkId,
    name: asText(record['name']) || inkId,
    sprite: npcName(asText(record['sprite'])),
    // One namespace per person: a key claimed twice would generate the same ink
    // global twice, and the second declaration is a compile error.
    variables: variables.filter(
      (one, at) => variables.findIndex((other) => other.key === one.key) === at
    )
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
