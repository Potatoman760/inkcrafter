/**
 * When a place on the map can be travelled to.
 *
 * This exists because the game's map gates used to be TypeScript closures —
 * `(ctx) => ctx.stats.get('faith') >= 4` — which is a fine thing to write and
 * an impossible thing to export. A function cannot be put in a JSON file, so
 * the whole world map was unreachable from an editor.
 *
 * The shape below is what those closures actually did, made into data. It is
 * deliberately small: three sources of truth (has the reader been here, what is
 * a stat, what is true of a person), six comparisons, and the three combinators
 * needed to join them. Not an expression language — there is no arithmetic and
 * no way to compare two variables — because the moment it becomes one, ink is
 * the better place to write it and this should defer.
 */

export type Cmp = '==' | '!=' | '<' | '<=' | '>' | '>='

export const COMPARISONS: readonly Cmp[] = ['==', '!=', '<', '<=', '>', '>=']

export type Term =
  /** How many times the reader has been through a knot. */
  | { source: 'visits'; path: string }
  /** A player stat, by ink name. */
  | { source: 'stat'; key: string }
  | { source: 'npcStat'; npc: string; key: string }
  | { source: 'npcStatus'; npc: string; key: string }
  | { source: 'npcFlag'; npc: string; key: string }

export type Condition =
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition }
  | { op: 'compare'; left: Term; cmp: Cmp; right: number | string | boolean }

/**
 * What the evaluator is allowed to ask.
 *
 * Five questions rather than one `variable(name)`, even though every one of them
 * is an ink global underneath. Keeping them apart is what lets the editor offer
 * a picker — choose a person, then one of their attributes — and lets `describe`
 * say "Abeline is married" instead of naming a variable at the reader.
 */
export interface ConditionHost {
  visits(path: string): number
  stat(key: string): number
  npcStat(npc: string, key: string): number
  npcStatus(npc: string, key: string): string
  npcFlag(npc: string, key: string): boolean
}

/**
 * Whether the condition holds. `null` means no gate at all.
 *
 * Total, on purpose. A condition naming something that no longer exists reads
 * as false and locks the place, rather than throwing in the middle of drawing a
 * map. A stale gate is a locked door; a thrown error is a broken game.
 */
export function evaluate(condition: Condition | null, host: ConditionHost): boolean {
  if (condition === null) return true

  switch (condition.op) {
    case 'all':
      return condition.of.every((one) => evaluate(one, host))
    case 'any':
      return condition.of.some((one) => evaluate(one, host))
    case 'not':
      return !evaluate(condition.of, host)
    case 'compare':
      return compare(read(condition.left, host), condition.cmp, condition.right)
  }
}

function read(term: Term, host: ConditionHost): number | string | boolean {
  switch (term.source) {
    case 'visits':
      return host.visits(term.path)
    case 'stat':
      return host.stat(term.key)
    case 'npcStat':
      return host.npcStat(term.npc, term.key)
    case 'npcStatus':
      return host.npcStatus(term.npc, term.key)
    case 'npcFlag':
      return host.npcFlag(term.npc, term.key)
  }
}

function compare(left: number | string | boolean, cmp: Cmp, right: number | string | boolean): boolean {
  if (cmp === '==') return left === right
  if (cmp === '!=') return left !== right

  // Ordering only makes sense between two numbers. Asking whether "married" is
  // less than "single" is a mistake rather than a question, so it is false.
  if (typeof left !== 'number' || typeof right !== 'number') return false

  switch (cmp) {
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
  }
}

/** Every knot a condition asks about, so an export can check they are real. */
export function referencedPaths(condition: Condition | null): string[] {
  if (condition === null) return []

  switch (condition.op) {
    case 'all':
    case 'any':
      return condition.of.flatMap(referencedPaths)
    case 'not':
      return referencedPaths(condition.of)
    case 'compare':
      return condition.left.source === 'visits' ? [condition.left.path] : []
  }
}

export interface ConditionLabels {
  /** Stat ink name to display name. */
  stats?: Record<string, string>
  /** NPC ink id to name. */
  npcs?: Record<string, string>
  /** `npc.key` to the attribute's label. */
  attrs?: Record<string, string>
}

/**
 * The condition as a sentence.
 *
 * Used for the hint on a locked place when the author has not written one, and
 * in the editor beside the controls, where it is the fastest way to tell that a
 * gate says something other than what was meant.
 */
export function describe(condition: Condition | null, labels: ConditionLabels = {}): string {
  if (condition === null) return 'Always open'

  switch (condition.op) {
    case 'all':
      return condition.of.length === 0
        ? 'Always open'
        : condition.of.map((one) => describe(one, labels)).join(' and ')
    case 'any':
      return condition.of.length === 0
        ? 'Never open'
        : condition.of.map((one) => describe(one, labels)).join(' or ')
    case 'not':
      return `not (${describe(condition.of, labels)})`
    case 'compare':
      return describeCompare(condition, labels)
  }
}

function describeCompare(
  condition: Extract<Condition, { op: 'compare' }>,
  labels: ConditionLabels
): string {
  const { left, cmp, right } = condition

  // The overwhelmingly common gate, and it reads badly the general way:
  // "visits of the_vision is more than 0" versus "after the vision".
  if (left.source === 'visits' && cmp === '>' && right === 0) return `after ${left.path}`
  if (left.source === 'visits' && cmp === '==' && right === 0) return `before ${left.path}`

  if (left.source === 'npcFlag') {
    const who = labels.npcs?.[left.npc] ?? left.npc
    const what = labels.attrs?.[`${left.npc}.${left.key}`] ?? left.key
    const wanted = right === true
    return `${who} ${cmp === '!=' ? !wanted : wanted ? 'is' : 'is not'} ${what}`
  }

  return `${nameOf(left, labels)} ${WORDS[cmp]} ${String(right)}`
}

const WORDS: Record<Cmp, string> = {
  '==': 'is',
  '!=': 'is not',
  '<': 'is under',
  '<=': 'is at most',
  '>': 'is over',
  '>=': 'is at least'
}

function nameOf(term: Term, labels: ConditionLabels): string {
  switch (term.source) {
    case 'visits':
      return `visits to ${term.path}`
    case 'stat':
      return labels.stats?.[term.key] ?? term.key
    case 'npcStat':
    case 'npcStatus':
    case 'npcFlag': {
      const who = labels.npcs?.[term.npc] ?? term.npc
      const what = labels.attrs?.[`${term.npc}.${term.key}`] ?? term.key
      return `${who}'s ${what}`
    }
  }
}
