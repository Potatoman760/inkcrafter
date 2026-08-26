import { newId } from './ids'

/**
 * The catalogue: what stats and items this story *has*.
 *
 * Not what the player currently holds — that is the game's job, at runtime. This
 * is the vocabulary the editor draws on to write correct ink: knowing that
 * `strength` is an integer and `shovel` is a member of `Tools` is what lets a
 * right-click produce `{inventory ? shovel}` instead of the author remembering a
 * name and a type.
 *
 * The catalogue is the source of truth for what exists, and
 * [statsInk.ts](./statsInk.ts) generates the declarations from it. The reverse —
 * scanning a hundred `VAR` lines back out of ink — is the arrangement this
 * deliberately avoids: nobody wants to hand-declare a hundred items in order for
 * a dropdown to know about them.
 */

/** What a stat holds. Ink has no integer/float distinction worth exposing here. */
export type StatKind = 'number' | 'boolean' | 'text'

export const STAT_KINDS: readonly StatKind[] = ['number', 'boolean', 'text']

/** An arbitrary pair the app stores and never interprets. */
export interface CustomField {
  label: string
  value: string
}

/**
 * What the game shows, as opposed to what ink calls it.
 *
 * None of this reaches the ink — a `VAR` has a name and a value and nothing
 * else — so this is the half of the catalogue that only exists to be exported.
 */
export interface Presentation {
  /** Shown to the player: "Brass Key", where `name` is `brass_key`. */
  display: string
  /** A sentence for the player, as distinct from `description` for the author. */
  blurb: string
  /** Whatever the engine resolves: a path, a sprite name, an atlas key. */
  icon: string
  custom: CustomField[]
}

export interface Variable {
  /** `stt_…`. Stable across renames, so nothing has to be repointed. */
  id: string
  /** The ink identifier: `strength`. Lower snake case, unique among declarations. */
  name: string
  kind: StatKind
  /** The declared starting value, as written into `VAR`. */
  initial: number | boolean | string
  /**
   * The range a number stat is kept inside, or null for unbounded.
   *
   * A first-class field rather than a custom one, because a game *enforces*
   * these: the player clamps every change to them, so they are part of what the
   * stat is rather than something extra a particular game happens to want. Ink
   * cannot express a clamp, which is why they only exist out here.
   */
  min: number | null
  max: number | null
  /** For the author, and for the model when it writes ink. Emitted as a comment. */
  description: string
}

/** A variable deliberately exposed on the player's character/status screen. */
export interface Stat extends Variable, Presentation {}

export interface Item extends Presentation {
  id: string
  /** The ink identifier: `shovel`. Unique across *every* category — ink list
   * members share one namespace once they are mixed in a single variable. */
  name: string
  /** Which `LIST` it is declared in. */
  category: string
  description: string
}

export interface StatsDocument {
  version: 1
  /** Player-visible variables. Existing projects keep their entries here. */
  stats: Stat[]
  /** Story-only variables, absent from player-facing status screens. */
  variables: Variable[]
  items: Item[]
  /** Declared order of the `LIST`s, so generated ink is stable between saves. */
  categories: string[]
}

/**
 * The ink variable holding what the player carries.
 *
 * One variable across every category, which is what makes `inventory ? shovel`
 * work regardless of which list `shovel` came from — and one fixed name, not a
 * setting. It was configurable once, and nothing honoured it: the assistant is
 * told outright to write `{inventory ? ring}`, and renaming it rewrote no ink,
 * so the rename silently broke every condition already written. Every other
 * name in this catalogue is renamed through a field that reports where the old
 * one is used; this one had no such report and could not have had a useful one,
 * because the variable is not the author's to begin with. So it is reserved
 * here instead, and `nameProblem` keeps it out of everyone else's way.
 */
export const INVENTORY = 'inventory'

export function emptyStats(): StatsDocument {
  return {
    version: 1,
    stats: [],
    variables: [],
    items: [],
    categories: []
  }
}

/**
 * An ink identifier from free text: `Brass Key` becomes `brass_key`.
 *
 * Ink identifiers cannot start with a digit and cannot contain punctuation, so
 * this is stricter than the codex's `slugify`, which produces hyphens for file
 * names. A name that reduces to nothing yields '' and the caller refuses it.
 */
export function inkName(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

/** The presentation half, empty. Kept in one place so both constructors agree. */
function blankPresentation(display: string): Presentation {
  return { display: display.trim(), blurb: '', icon: '', custom: [] }
}

export function newStat(name: string, kind: StatKind = 'number'): Stat {
  return {
    id: newId('stt'),
    name: inkName(name),
    kind,
    initial: kind === 'number' ? 0 : kind === 'boolean' ? false : '',
    min: null,
    max: null,
    description: '',
    // What was typed becomes the display name; the ink identifier is derived
    // from it. "Brass Key" is what a player should see, and brass_key is not.
    ...blankPresentation(name)
  }
}

export function newVariable(name: string, kind: StatKind = 'number'): Variable {
  return {
    id: newId('stt'),
    name: inkName(name),
    kind,
    initial: kind === 'number' ? 0 : kind === 'boolean' ? false : '',
    min: null,
    max: null,
    description: ''
  }
}

export function newItem(name: string, category: string): Item {
  return {
    id: newId('stt'),
    name: inkName(name),
    category,
    description: '',
    ...blankPresentation(name)
  }
}

/* Operations. Each returns a whole new document; none mutates. */

export function addStat(doc: StatsDocument, stat: Stat): StatsDocument {
  return { ...doc, stats: [...doc.stats, stat] }
}

export function updateStat(doc: StatsDocument, id: string, changes: Partial<Stat>): StatsDocument {
  return {
    ...doc,
    stats: doc.stats.map((stat) => (stat.id === id ? coerceStat({ ...stat, ...changes }) : stat))
  }
}

export function removeStat(doc: StatsDocument, id: string): StatsDocument {
  return { ...doc, stats: doc.stats.filter((stat) => stat.id !== id) }
}

export function addVariable(doc: StatsDocument, variable: Variable): StatsDocument {
  return { ...doc, variables: [...doc.variables, variable] }
}

export function updateVariable(
  doc: StatsDocument,
  id: string,
  changes: Partial<Variable>
): StatsDocument {
  return {
    ...doc,
    variables: doc.variables.map((variable) =>
      variable.id === id ? coerceVariable({ ...variable, ...changes }) : variable
    )
  }
}

export function removeVariable(doc: StatsDocument, id: string): StatsDocument {
  return { ...doc, variables: doc.variables.filter((variable) => variable.id !== id) }
}

export function addItem(doc: StatsDocument, item: Item): StatsDocument {
  return {
    ...doc,
    items: [...doc.items, item],
    categories: doc.categories.includes(item.category)
      ? doc.categories
      : [...doc.categories, item.category]
  }
}

export function updateItem(doc: StatsDocument, id: string, changes: Partial<Item>): StatsDocument {
  const items = doc.items.map((item) => (item.id === id ? { ...item, ...changes } : item))
  const next = { ...doc, items }
  return changes.category === undefined ? next : withCategory(next, changes.category)
}

export function removeItem(doc: StatsDocument, id: string): StatsDocument {
  return { ...doc, items: doc.items.filter((item) => item.id !== id) }
}

export function addCategory(doc: StatsDocument, name: string): StatsDocument {
  return withCategory(doc, name)
}

/**
 * Drops a category and everything in it. Emptying it instead would leave items
 * with a category that no longer generates a `LIST`, which compiles to nothing
 * and fails at the first use.
 */
export function removeCategory(doc: StatsDocument, name: string): StatsDocument {
  return {
    ...doc,
    categories: doc.categories.filter((category) => category !== name),
    items: doc.items.filter((item) => item.category !== name)
  }
}

/**
 * Renames a category, carrying its items with it.
 *
 * Both halves have to move together: an item left pointing at the old name would
 * be in a category that no longer generates a `LIST`, which is the same broken
 * state `removeCategory` avoids by taking its items with it.
 */
export function renameCategory(doc: StatsDocument, from: string, to: string): StatsDocument {
  const trimmed = to.trim()
  if (trimmed.length === 0 || trimmed === from || doc.categories.includes(trimmed)) return doc

  return {
    ...doc,
    categories: doc.categories.map((category) => (category === from ? trimmed : category)),
    items: doc.items.map((item) => (item.category === from ? { ...item, category: trimmed } : item))
  }
}

/**
 * Moves an entry within its list. Array order is what both the generated ink and
 * the export follow, so this is the only control over how either reads.
 *
 * Items move within their own category rather than across the flat array, since
 * that is the order the author sees.
 */
export function moveStat(doc: StatsDocument, id: string, by: number): StatsDocument {
  const stats = shift(doc.stats, (stat) => stat.id === id, by)
  // The same document back when nothing moved: a new object would look like an
  // edit, and an edit rewrites state.ink and the export for no reason.
  return stats === doc.stats ? doc : { ...doc, stats }
}

export function moveVariable(doc: StatsDocument, id: string, by: number): StatsDocument {
  const variables = shift(doc.variables, (variable) => variable.id === id, by)
  return variables === doc.variables ? doc : { ...doc, variables }
}

export function moveItem(doc: StatsDocument, id: string, by: number): StatsDocument {
  const moving = doc.items.find((item) => item.id === id)
  if (!moving) return doc

  const within = doc.items.filter((item) => item.category === moving.category)
  const reordered = shift(within, (item) => item.id === id, by)
  if (reordered === within) return doc

  // Spliced back over the positions the category occupied, so items in other
  // categories keep their places in the flat array.
  const slots = doc.items.flatMap((item, index) => (item.category === moving.category ? [index] : []))
  const items = [...doc.items]
  for (const [at, index] of slots.entries()) items[index] = reordered[at]!

  return { ...doc, items }
}

export function moveCategory(doc: StatsDocument, name: string, by: number): StatsDocument {
  const categories = shift(doc.categories, (category) => category === name, by)
  return categories === doc.categories ? doc : { ...doc, categories }
}

function shift<T>(list: T[], match: (item: T) => boolean, by: number): T[] {
  const from = list.findIndex(match)
  const to = from + by
  if (from === -1 || to < 0 || to >= list.length) return list

  const next = [...list]
  const [moving] = next.splice(from, 1)
  next.splice(to, 0, moving!)
  return next
}

function withCategory(doc: StatsDocument, name: string): StatsDocument {
  const trimmed = name.trim()
  if (trimmed.length === 0 || doc.categories.includes(trimmed)) return doc
  return { ...doc, categories: [...doc.categories, trimmed] }
}

/** Keeps `initial` consistent with `kind` after the kind is changed. */
function coerceStat(stat: Stat): Stat {
  return coerceVariable(stat)
}

function coerceVariable<T extends Variable>(variable: T): T {
  if (variable.kind === 'number') {
    return { ...variable, initial: typeof variable.initial === 'number' ? variable.initial : 0 }
  }
  if (variable.kind === 'boolean') {
    return { ...variable, initial: variable.initial === true }
  }
  return { ...variable, initial: typeof variable.initial === 'string' ? variable.initial : '' }
}

/* Reading. */

/** Names already taken, so a new one can be refused before it collides in ink. */
export function takenNames(doc: StatsDocument): Set<string> {
  return new Set([
    INVENTORY,
    ...doc.stats.map((stat) => stat.name),
    ...doc.variables.map((variable) => variable.name),
    ...doc.items.map((item) => item.name)
  ])
}

/**
 * Why this name cannot be used, or null when it can.
 *
 * `exceptId` lets an entry keep its own name while being edited, which is
 * otherwise reported as colliding with itself.
 */
export function nameProblem(doc: StatsDocument, name: string, exceptId?: string): string | null {
  const cleaned = inkName(name)
  if (cleaned.length === 0) return 'A name needs at least one letter or digit.'

  const clash =
    doc.stats.find((stat) => stat.name === cleaned && stat.id !== exceptId) ??
    doc.variables.find((variable) => variable.name === cleaned && variable.id !== exceptId) ??
    doc.items.find((item) => item.name === cleaned && item.id !== exceptId)

  if (clash) return `${cleaned} is already used.`
  if (cleaned === INVENTORY) return `${cleaned} is the inventory variable.`

  // Ink list members and variables share a namespace with the list types
  // themselves, so a category name is equally unavailable.
  if (doc.categories.some((category) => inkName(category) === cleaned)) {
    return `${cleaned} is already a category.`
  }

  return null
}

/**
 * Why this category name cannot be used, or null when it can.
 *
 * The mirror of `nameProblem`, and the reason it exists: a category becomes a
 * `LIST`, whose name shares a namespace with every stat and item. Guarding only
 * one direction left the collision reachable from the other.
 */
export function categoryProblem(doc: StatsDocument, name: string, except?: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'A category needs a name.'
  if (inkName(trimmed).length === 0) return 'A name needs at least one letter or digit.'

  if (doc.categories.some((category) => category !== except && category === trimmed)) {
    return `There is already a ${trimmed} category.`
  }

  const identifier = inkName(trimmed)
  if (identifier === INVENTORY) return `${trimmed} is the inventory variable.`

  const clash =
    doc.stats.find((stat) => stat.name === identifier) ??
    doc.variables.find((variable) => variable.name === identifier) ??
    doc.items.find((item) => item.name === identifier)

  return clash ? `${trimmed} collides with the ${identifier} already declared.` : null
}

export function itemsInCategory(doc: StatsDocument, category: string): Item[] {
  return doc.items.filter((item) => item.category === category)
}

/* Persistence. */

function asKind(value: unknown): StatKind {
  return STAT_KINDS.includes(value as StatKind) ? (value as StatKind) : 'number'
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The presentation half of a record, all optional.
 *
 * A catalogue written before these fields existed simply has none of them, and
 * loads with them empty rather than being rejected — which is the whole reason
 * the reader is tolerant field by field rather than validating a schema.
 */
function asPresentation(record: Record<string, unknown>): Presentation {
  const custom = Array.isArray(record['custom'])
    ? record['custom']
        .map((entry): CustomField | null => {
          if (typeof entry !== 'object' || entry === null) return null
          const pair = entry as Record<string, unknown>
          const label = asText(pair['label']).trim()
          return label.length === 0 ? null : { label, value: asText(pair['value']) }
        })
        .filter((field): field is CustomField => field !== null)
    : []

  return {
    display: asText(record['display']),
    blurb: asText(record['blurb']),
    icon: asText(record['icon']),
    custom
  }
}

function asStat(value: unknown): Stat | null {
  const variable = asVariable(value)
  if (!variable || typeof value !== 'object' || value === null) return null
  return { ...variable, ...asPresentation(value as Record<string, unknown>) }
}

function asVariable(value: unknown): Variable | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = typeof record['name'] === 'string' ? inkName(record['name']) : ''
  if (name.length === 0) return null

  const kind = asKind(record['kind'])
  const initial = record['initial']

  return coerceVariable({
    id: typeof record['id'] === 'string' && record['id'].length > 0 ? record['id'] : newId('stt'),
    name,
    kind,
    initial:
      typeof initial === 'number' || typeof initial === 'boolean' || typeof initial === 'string'
        ? initial
        : 0,
    description: asText(record['description']),
    min: asBound(record['min']),
    max: asBound(record['max'])
  })
}

/** A clamp, or null for unbounded. Absent and unreadable both mean unbounded. */
function asBound(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asItem(value: unknown): Item | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const name = typeof record['name'] === 'string' ? inkName(record['name']) : ''
  const category = typeof record['category'] === 'string' ? record['category'].trim() : ''
  if (name.length === 0 || category.length === 0) return null

  return {
    id: typeof record['id'] === 'string' && record['id'].length > 0 ? record['id'] : newId('stt'),
    name,
    category,
    description: asText(record['description']),
    ...asPresentation(record)
  }
}

/**
 * Parses a catalogue, tolerating anything. A malformed file yields an empty one
 * rather than throwing — the same principle as the plan, settings and codex
 * readers. An item naming no category is dropped rather than guessed at, since
 * the category decides which `LIST` it is declared in.
 */
export function parseStats(json: string): StatsDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyStats()
    const record = parsed as Record<string, unknown>

    const items = Array.isArray(record['items'])
      ? record['items'].map(asItem).filter((item): item is Item => item !== null)
      : []

    const declared = Array.isArray(record['categories'])
      ? record['categories'].filter(
          (category): category is string => typeof category === 'string' && category.trim().length > 0
        )
      : []

    // A category an item claims but the list forgot still has to generate, or
    // that item declares nothing and every use of it fails to compile.
    const categories = [...declared]
    for (const item of items) {
      if (!categories.includes(item.category)) categories.push(item.category)
    }

    // `inventoryName` was a field here once. A file that still carries it is
    // read without it rather than refused: the name is fixed now, and the value
    // it held was never reflected in the ink the assistant wrote anyway.
    return {
      version: 1,
      stats: Array.isArray(record['stats'])
        ? record['stats'].map(asStat).filter((stat): stat is Stat => stat !== null)
        : [],
      variables: Array.isArray(record['variables'])
        ? record['variables'].map(asVariable).filter((variable): variable is Variable => variable !== null)
        : [],
      items,
      categories
    }
  } catch {
    return emptyStats()
  }
}

export function serialiseStats(doc: StatsDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
