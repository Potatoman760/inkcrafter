import type { ChoiceRef } from './inkChoices'

/**
 * The edits the GUI makes to ink.
 *
 * Each returns a single replacement — a range and what goes in it — rather than
 * a whole new document, so the caller can apply it as one CodeMirror transaction
 * and leave undo, the cursor and everything outside the range alone.
 *
 * Composing, never rewriting. Adding a second condition to `{a}` produces
 * `{a and b}`; the existing text is carried across as a substring and is never
 * parsed, so an expression the app could not have written survives exactly.
 */

export interface TextEdit {
  from: number
  to: number
  insert: string
  /** Where to leave the cursor, as an offset into `insert`. */
  cursor?: number
}

export type Combine = 'and' | 'or'

/**
 * Adds a condition to a choice, or widens the one it has.
 *
 * `{a}` plus `b` is `{a and b}` rather than `{(a) and (b)}`: ink's `and` binds
 * loosely enough that the common cases read correctly, and parenthesising
 * everything would make a hand-written condition unrecognisable to whoever wrote
 * it. A precedence-sensitive expression is exactly the case the author should
 * see and adjust, which they can, because the result is plain text on the line.
 */
export function addCondition(choice: ChoiceRef, condition: string, combine: Combine = 'and'): TextEdit {
  const clean = condition.trim()

  if (!choice.condition) {
    const insert = `{${clean}} `
    return { from: choice.conditionAt, to: choice.conditionAt, insert, cursor: insert.length }
  }

  const existing = choice.condition.text.trim()
  const insert = existing.length === 0 ? `{${clean}}` : `{${existing} ${combine} ${clean}}`

  return { from: choice.condition.from, to: choice.condition.to, insert, cursor: insert.length }
}

/** Removes a choice's condition entirely, including the space after it. */
export function removeCondition(source: string, choice: ChoiceRef): TextEdit | null {
  if (!choice.condition) return null

  let to = choice.condition.to
  while (to < choice.lineTo && /[ \t]/.test(source[to]!)) to++

  return { from: choice.condition.from, to, insert: '' }
}

/**
 * Adds a line at the top of a choice's body.
 *
 * Where the seeded projects already put one by hand, and where it has to be: a
 * line placed after the divert at the end of the body would never run. A tag
 * belongs at the top for a second reason — ink attaches a standalone tag to the
 * text line that *follows* it, so below the prose it would govern the wrong one.
 */
export function addToChoiceBody(choice: ChoiceRef, text: string): TextEdit {
  const line = `${choice.bodyIndent}${text.trim()}`

  // A choice with no body yet needs the line started as well as written.
  const hasBody = choice.effectAt !== choice.lineTo
  const insert = hasBody ? `${line}\n` : `\n${line}`

  return { from: choice.effectAt, to: choice.effectAt, insert, cursor: insert.length }
}

export function addEffect(choice: ChoiceRef, logic: string): TextEdit {
  return addToChoiceBody(choice, `~ ${logic.trim()}`)
}

export function addTagToChoice(choice: ChoiceRef, tag: string): TextEdit {
  return addToChoiceBody(choice, `# ${tag.trim()}`)
}

/**
 * Adds a `~` line at the cursor, for an effect that belongs to a knot rather
 * than to any one choice. Indented to match the line it lands on.
 */
export function addEffectAtLine(source: string, offset: number, logic: string): TextEdit {
  const lineFrom = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  let lineEnd = source.indexOf('\n', lineFrom)
  if (lineEnd === -1) lineEnd = source.length

  const text = source.slice(lineFrom, lineEnd)
  const indent = /^[ \t]*/.exec(text)![0]

  // Onto the blank line if that is where the cursor is; otherwise after it.
  if (text.trim().length === 0) {
    const insert = `${indent}~ ${logic.trim()}`
    return { from: lineFrom, to: lineEnd, insert, cursor: insert.length }
  }

  const insert = `\n${indent}~ ${logic.trim()}`
  return { from: lineEnd, to: lineEnd, insert, cursor: insert.length }
}

/**
 * Adds a tag on its own line *above* the line the cursor is on.
 *
 * Above, not below, because ink attaches a standalone tag to the text line that
 * follows it. Put after the prose it is meant to describe, a background would
 * come up one line late — and would silently look right most of the time, which
 * is worse than being obviously wrong.
 */
export function addTagAtLine(
  source: string,
  offset: number,
  tag: string,
  /** Below instead — for a knot header, where above would put it outside. */
  after = false
): TextEdit {
  const lineFrom = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1

  let lineEnd = source.indexOf('\n', lineFrom)
  if (lineEnd === -1) lineEnd = source.length

  const text = source.slice(lineFrom, lineEnd)
  const indent = /^[ \t]*/.exec(text)![0]
  const line = `${indent}# ${tag.trim()}`

  // A blank line is used rather than pushed down: it is already the gap the
  // author left, and a tag above nothing governs nothing.
  if (text.trim().length === 0) {
    return { from: lineFrom, to: lineEnd, insert: line, cursor: line.length }
  }

  if (after) {
    const insert = `\n${line}`
    return { from: lineEnd, to: lineEnd, insert, cursor: insert.length }
  }

  const insert = `${line}\n`
  return { from: lineFrom, to: lineFrom, insert, cursor: line.length }
}

/**
 * Replaces exactly a span. Used for a tag's body and for a `~` line's logic —
 * both keep their marker and the spacing around it, because the span excludes
 * them.
 */
export function replaceSpan(span: { from: number; to: number }, text: string): TextEdit {
  const insert = text.trim()
  return { from: span.from, to: span.to, insert, cursor: insert.length }
}

/** Removes a whole line, and the newline that ended it. */
export function removeLine(source: string, line: { from: number; to: number }): TextEdit {
  const after =
    source[line.to] === '\r' && source[line.to + 1] === '\n'
      ? line.to + 2
      : source[line.to] === '\n'
        ? line.to + 1
        : line.to

  return { from: line.from, to: after, insert: '' }
}

/* The vocabulary, rendered ------------------------------------------------- */

export type Comparison = '>=' | '>' | '==' | '!=' | '<' | '<='

export const COMPARISONS: readonly Comparison[] = ['>=', '>', '==', '!=', '<', '<=']

export const COMPARISON_LABELS: Record<Comparison, string> = {
  '>=': 'at least',
  '>': 'more than',
  '==': 'exactly',
  '!=': 'not',
  '<': 'less than',
  '<=': 'at most'
}

export function statCondition(name: string, operator: Comparison, value: string): string {
  return `${name} ${operator} ${value}`
}

/** A yes/no stat reads better as the bare name than as `== true`. */
export function flagCondition(name: string, wanted: boolean): string {
  return wanted ? name : `not ${name}`
}

export function itemCondition(inventory: string, item: string, held: boolean): string {
  return held ? `${inventory} ? ${item}` : `not (${inventory} ? ${item})`
}

export type StatChange = 'set' | 'add' | 'subtract'

export function statEffect(name: string, change: StatChange, value: string): string {
  if (change === 'set') return `${name} = ${value}`
  return `${name} = ${name} ${change === 'add' ? '+' : '-'} ${value}`
}

export function flagEffect(name: string, value: boolean): string {
  return `${name} = ${value ? 'true' : 'false'}`
}

export function itemEffect(inventory: string, item: string, give: boolean): string {
  return `${inventory} ${give ? '+=' : '-='} ${item}`
}

/* The vocabulary, read back ------------------------------------------------ */

export type EffectRef =
  | { kind: 'stat'; name: string; change: StatChange; value: string }
  | { kind: 'flag'; name: string; name2?: never; value: boolean }
  | { kind: 'item'; variable: string; item: string; give: boolean }

const NAME = /^[A-Za-z_]\w*$/

/**
 * A literal simple enough to put back in a box.
 *
 * `strength = 5` is editable; `strength = nerve + courage` is an expression the
 * author wrote and the menu has no business turning into a dropdown.
 */
function simpleValue(text: string): string | null {
  const value = text.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value
  if (/^"[^"]*"$/.test(value)) return value
  if (NAME.test(value)) return value
  return null
}

/**
 * Reads a `~` line back into the thing the menu would have written.
 *
 * Deliberately only the shapes the renderers above produce. Anything else — a
 * compound expression, a function call, someone's hand-written arithmetic —
 * returns null and stays an ordinary logic line the menu will not offer to
 * edit. The same bargain the condition builder strikes: recognise what we wrote,
 * never mangle what we did not.
 *
 * The paired test asserts every renderer's output parses back to its input, so
 * changing one without the other fails rather than quietly halving the feature.
 */
export function parseEffect(logic: string): EffectRef | null {
  const text = logic.trim().replace(/^~\s*/, '').trim()

  const give = /^([A-Za-z_]\w*)\s*\+=\s*([A-Za-z_]\w*)$/.exec(text)
  if (give) return { kind: 'item', variable: give[1]!, item: give[2]!, give: true }

  const take = /^([A-Za-z_]\w*)\s*-=\s*([A-Za-z_]\w*)$/.exec(text)
  if (take) return { kind: 'item', variable: take[1]!, item: take[2]!, give: false }

  // The backreference is what tells `strength = strength + 1` from
  // `strength = nerve + 1`, and only the first is an "add one to strength".
  const add = /^([A-Za-z_]\w*)\s*=\s*\1\s*\+\s*(.+)$/.exec(text)
  if (add) {
    const value = simpleValue(add[2]!)
    return value ? { kind: 'stat', name: add[1]!, change: 'add', value } : null
  }

  const subtract = /^([A-Za-z_]\w*)\s*=\s*\1\s*-\s*(.+)$/.exec(text)
  if (subtract) {
    const value = simpleValue(subtract[2]!)
    return value ? { kind: 'stat', name: subtract[1]!, change: 'subtract', value } : null
  }

  const assign = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(text)
  if (!assign) return null

  const raw = assign[2]!.trim()
  if (raw === 'true' || raw === 'false') {
    return { kind: 'flag', name: assign[1]!, value: raw === 'true' }
  }

  const value = simpleValue(raw)
  return value ? { kind: 'stat', name: assign[1]!, change: 'set', value } : null
}

/** Writes an `EffectRef` back out, so an edit round-trips through the menu. */
export function renderEffect(effect: EffectRef): string {
  if (effect.kind === 'item') return itemEffect(effect.variable, effect.item, effect.give)
  if (effect.kind === 'flag') return flagEffect(effect.name, effect.value)
  return statEffect(effect.name, effect.change, effect.value)
}
