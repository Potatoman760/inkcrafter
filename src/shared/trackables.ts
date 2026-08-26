import { npcVar, type NpcDocument } from './bundle/npcDoc'
import type { StateCommand, TagCommand, TagOp } from './bundle/tagSpec'
import {
  flagCondition,
  flagEffect,
  statCondition,
  statEffect,
  type Comparison,
  type StatChange
} from './inkEdits'
import type { StatsDocument } from './statsDoc'

/**
 * Everything the story tracks about a number, in one list.
 *
 * Two catalogues hold it — `stats.json` for the player, `npcs.json` for the
 * cast — and they stay two files, because they are genuinely different things
 * to manage and the game reads them separately. But an author gating a choice
 * does not care which file a name came from, and neither should the menu that
 * writes the gate. This is the derived view where they meet: one row per ink
 * global, carrying enough to write a change and a condition for it.
 *
 * Nothing here is stored. It is recomputed from the two documents, so there is
 * no third place for a name to go stale.
 */

export type TrackableKind = 'number' | 'flag' | 'text'

/** How a `#` tag names this, when a tag can name it at all. */
export type TagTarget =
  | { kind: 'stat'; stat: string }
  | { kind: 'npc'; id: string; attr: string }

/**
 * Which half of the machinery applies a change.
 *
 * `tag` means something at runtime owns it: the game's `StatsManager` or
 * `NpcManager` clamps the change to the catalogue's range, validates a status
 * against its permitted words, and tells the HUD. `ink` means nothing does, so
 * a plain `~` assignment is the whole mechanism and the honest thing to write.
 *
 * The line falls where it does because of what each manager can hold. Every
 * cast attribute has one. A player stat only has one when it is a number —
 * `# stat:` carries an integer and nothing else, and a yes/no stat has no range
 * to clamp and no bar to fill.
 */
export type Channel = 'tag' | 'ink'

export interface Trackable {
  /** Unique in the list, and stable enough to be a React key. */
  key: string
  /** The ink global: `courage`, `abeline_affection`. */
  variable: string
  kind: TrackableKind
  channel: Channel
  /** Which catalogue it came from, which decides where it may be edited. */
  source: 'player' | 'cast'
  /** Null when nothing at runtime owns it, which is what `channel: 'ink'` means. */
  tag: TagTarget | null
  /** What to call it in a list: `Courage`, `Affection`. */
  label: string
  /** The heading it sits under: `Stats`, `Vars`, or the character's name. */
  group: string
  min: number | null
  max: number | null
  /** A status's permitted words. Empty for everything else. */
  values: string[]
  /** Everything a filter box should match against. */
  search: string
}

export function trackablesOf(stats: StatsDocument, npcs: NpcDocument): Trackable[] {
  const all: Trackable[] = []

  const playerVariable = (
    variable: StatsDocument['stats'][number] | StatsDocument['variables'][number],
    group: 'Stats' | 'Vars'
  ): void => {
    const kind: TrackableKind =
      variable.kind === 'boolean' ? 'flag' : variable.kind === 'text' ? 'text' : 'number'
    const display = 'display' in variable ? variable.display : ''

    all.push({
      key: `stat:${variable.name}`,
      variable: variable.name,
      kind,
      channel: kind === 'number' ? 'tag' : 'ink',
      source: 'player',
      tag: kind === 'number' ? { kind: 'stat', stat: variable.name } : null,
      label: display.length > 0 ? display : variable.name,
      group,
      min: variable.min,
      max: variable.max,
      values: [],
      search: `${variable.name} ${display} ${variable.description}`
    })
  }
  for (const stat of stats.stats) playerVariable(stat, 'Stats')
  for (const variable of stats.variables) playerVariable(variable, 'Vars')

  for (const npc of npcs.npcs) {
    const cast = (key: string, kind: TrackableKind, label: string, extra: Partial<Trackable>): void => {
      all.push({
        key: `npc:${npc.inkId}.${key}`,
        variable: npcVar(npc.inkId, key),
        kind,
        channel: 'tag',
        source: 'cast',
        tag: { kind: 'npc', id: npc.inkId, attr: key },
        label,
        group: npc.name,
        min: null,
        max: null,
        values: [],
        search: `${npc.inkId} ${npc.name} ${key} ${label}`,
        ...extra
      })
    }

    for (const stat of npc.stats) {
      cast(stat.key, 'number', stat.label, { min: stat.min, max: stat.max })
    }
    for (const status of npc.statuses) {
      cast(status.key, 'text', status.label, { values: status.values })
    }
    for (const flag of npc.flags) {
      cast(flag.key, 'flag', flag.label, {})
    }
  }

  return all
}

export function findTrackable(all: readonly Trackable[], variable: string): Trackable | null {
  return all.find((one) => one.variable === variable) ?? null
}

/** The row a parsed `# stat:` or `# npc:` tag names, or null when nothing does. */
export function trackableForTag(
  all: readonly Trackable[],
  command: TagCommand
): Trackable | null {
  if (command.kind === 'stat') {
    return all.find((one) => one.tag?.kind === 'stat' && one.tag.stat === command.stat) ?? null
  }

  if (command.kind === 'npc') {
    return (
      all.find(
        (one) =>
          one.tag?.kind === 'npc' && one.tag.id === command.id && one.tag.attr === command.attr
      ) ?? null
    )
  }

  return null
}

/* Writing ------------------------------------------------------------------ */

/**
 * A change, as the tag that carries it.
 *
 * Null for anything nothing owns at runtime — use {@link inkEffectFor} there,
 * because a tag no manager reads would be a line that looks like it does
 * something and does not.
 */
export function tagFor(trackable: Trackable, op: TagOp, value: string): TagCommand | null {
  const target = trackable.tag
  if (!target) return null

  if (target.kind === 'stat') {
    const amount = Number(value)
    if (!Number.isFinite(amount)) return null
    return { kind: 'stat', stat: target.stat, op, value: Math.round(amount) }
  }

  return { kind: 'npc', id: target.id, attr: target.attr, op, value: value.trim() }
}

/** A change as ink logic, for the things no manager owns. */
export function inkEffectFor(trackable: Trackable, change: StatChange, value: string): string {
  if (trackable.kind === 'flag') {
    return flagEffect(trackable.variable, value === 'true')
  }
  if (trackable.kind === 'text') {
    return statEffect(trackable.variable, 'set', quoted(value))
  }
  return statEffect(trackable.variable, change, value)
}

/**
 * A condition, as ink source. Always ink: only ink can branch, and the game has
 * already written the change back into the variable by the time one is read.
 *
 * A status is quoted here and bare in the tag that sets it —
 * `# npc: abeline status = married` stores the ink string `"married"` — which
 * is exactly the kind of detail the catalogue exists to get right unprompted.
 */
export function conditionFor(
  trackable: Trackable,
  comparison: Comparison,
  value: string
): string {
  if (trackable.kind === 'flag') return flagCondition(trackable.variable, value === 'true')
  if (trackable.kind === 'text') {
    return statCondition(trackable.variable, comparison === '!=' ? '!=' : '==', quoted(value))
  }
  return statCondition(trackable.variable, comparison, value.trim() || '0')
}

/* Applying ----------------------------------------------------------------- */

/** Somewhere the story's globals live. `story.variablesState` is one. */
export interface VariableStore {
  get(name: string): unknown
  set(name: string, value: number | string | boolean): void
}

/**
 * Applies a change the way a game will, so a preview can show the same story.
 *
 * ink does not do this: a tag is an opaque string to it, and the whole point of
 * the tag channel is that something outside the language reads it and clamps.
 * That something is `StatsManager` / `NpcManager` in the player and this in the
 * editor's preview, and the two have to agree or a gate opens in one and not the
 * other. Kept here, beside the definition of what the range is.
 *
 * Returns false for a change nothing in the catalogues describes, or a value
 * that cannot mean anything — a status outside its permitted words, an amount
 * that is not a number. Refusing is what the player does too; a silent wrong
 * value is worse than a change that visibly did not happen.
 */
export function applyChange(
  store: VariableStore,
  all: readonly Trackable[],
  command: StateCommand
): boolean {
  const one = trackableForTag(all, command)
  if (!one) return false

  const raw = command.kind === 'stat' ? String(command.value) : command.value

  if (one.kind === 'flag') {
    store.set(one.variable, raw === 'true' || raw === '1')
    return true
  }

  if (one.kind === 'text') {
    if (one.values.length > 0 && !one.values.includes(raw)) return false
    store.set(one.variable, raw)
    return true
  }

  const amount = Number(raw)
  if (!Number.isFinite(amount)) return false

  const current = Number(store.get(one.variable))
  const base = Number.isFinite(current) ? current : 0
  const next = command.op === '+' ? base + amount : command.op === '-' ? base - amount : amount

  store.set(one.variable, clamp(next, one.min, one.max))
  return true
}

function clamp(value: number, min: number | null, max: number | null): number {
  const floored = min === null ? value : Math.max(min, value)
  return max === null ? floored : Math.min(max, floored)
}

/** Ink has no escape for a quote inside a string, so one is dropped rather than
 *  allowed to end the literal early and break the line. Matches `initialLiteral`. */
function quoted(value: string): string {
  const text = value.trim()
  if (/^".*"$/.test(text)) return text
  return `"${text.replace(/"/g, '')}"`
}
