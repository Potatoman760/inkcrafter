/**
 * Finding the choices in ink source, with the spans needed to edit them.
 *
 * The unit the GUI acts on is a *choice*: gating one, or hanging an effect off
 * taking it. Both are edits to a precise range — a condition sits between the
 * markers and the text, and an effect is a `~` line at the top of the body — so
 * this returns offsets rather than text, and the caller replaces exactly what it
 * asked for.
 *
 * It deliberately does not parse the condition. The menu only ever *composes*
 * one — `{a}` becomes `{a and b}` — which means an expression the app could not
 * have written survives untouched, because nothing ever takes it apart. Reading
 * a condition back into structured rows is the inspector's problem, and wanting
 * it here would have been the fastest way to mangle someone's hand-written
 * `{inventory ? shovel and LIST_COUNT(pack) < 3}`.
 */

/** Choice bullets (`*`, `+`, possibly nested) and gathers (`-`, but not `->`). */
const BULLET = /^(?:[*+](?:[ \t]*[*+])*|-(?![>-])(?:[ \t]*-(?![>-]))*)[ \t]*/
/** A choice or gather label, e.g. `(again)`. */
const LABEL = /^\([A-Za-z_]\w*\)[ \t]*/

export interface Span {
  from: number
  to: number
}

export interface EffectLine extends Span {
  /** 1-based line number. */
  line: number
  /** The logic after the `~`, trimmed. */
  text: string
}

export interface ChoiceRef {
  /** 1-based line the choice is written on. */
  line: number
  /** Offset of the start of that line. */
  lineFrom: number
  /** Offset of the end of that line, excluding the newline. */
  lineTo: number
  /** Nesting: 1 for `*`, 2 for `**`. */
  depth: number
  /** `*` for once-only, `+` for sticky. */
  marker: string
  /** The condition's `{…}` span and its inner text, when the choice has one. */
  condition: (Span & { text: string }) | null
  /** Where a first condition would go: after the markers and any label. */
  conditionAt: number
  /** What the reader is offered, brackets and all. */
  text: string
  /** The indentation an effect line in this choice's body needs. */
  bodyIndent: string
  /** Where an effect line goes: the start of the body's first line. */
  effectAt: number
  /** `~` lines already at the top of the body. */
  effects: EffectLine[]
}

/** Position of the `}` matching an already-consumed `{`, or -1 if unclosed. */
function closingBrace(source: string, from: number, limit: number): number {
  let depth = 1
  for (let index = from; index < limit; index++) {
    if (source[index] === '{') depth++
    else if (source[index] === '}' && --depth === 0) return index
  }
  return -1
}

interface Line {
  from: number
  to: number
  text: string
  number: number
}

function linesOf(source: string): Line[] {
  const lines: Line[] = []
  let from = 0
  let number = 1

  for (;;) {
    const newline = source.indexOf('\n', from)
    const to = newline === -1 ? source.length : newline
    // \r is left out of the span so an edit does not land between it and \n.
    const end = to > from && source[to - 1] === '\r' ? to - 1 : to
    lines.push({ from, to: end, text: source.slice(from, end), number })

    if (newline === -1) break
    from = newline + 1
    number++
  }

  return lines
}

const indentOf = (text: string): string => /^[ \t]*/.exec(text)![0]

/** Width in columns, counting a tab as one — only relative depth matters here. */
const indentWidth = (text: string): number => indentOf(text).length

export function scanChoices(source: string): ChoiceRef[] {
  const lines = linesOf(source)
  const choices: ChoiceRef[] = []

  for (const [index, line] of lines.entries()) {
    const indent = indentOf(line.text)
    const rest = line.text.slice(indent.length)

    const bullet = BULLET.exec(rest)
    if (!bullet) continue

    const markers = bullet[0].replace(/[ \t]/g, '')
    // A gather is not a choice; there is nothing to gate or hang an effect on.
    if (!markers.startsWith('*') && !markers.startsWith('+')) continue

    let at = line.from + indent.length + bullet[0].length

    const label = LABEL.exec(source.slice(at, line.to))
    if (label) at += label[0].length

    // In ink the order is markers, then an optional (label), then an optional
    // {condition}. Anything else on the line is what the reader is offered.
    const conditionAt = at
    let condition: (Span & { text: string }) | null = null

    if (source[at] === '{') {
      const close = closingBrace(source, at + 1, line.to)
      if (close !== -1) {
        condition = { from: at, to: close + 1, text: source.slice(at + 1, close) }
        at = close + 1
        while (at < line.to && /[ \t]/.test(source[at]!)) at++
      }
    }

    const { indent: bodyIndent, at: effectAt, effects } = bodyOf(lines, index, indent)

    choices.push({
      line: line.number,
      lineFrom: line.from,
      lineTo: line.to,
      depth: markers.length,
      marker: markers[0]!,
      condition,
      conditionAt,
      text: source.slice(at, line.to),
      bodyIndent,
      effectAt,
      effects
    })
  }

  return choices
}

/**
 * Where a choice's body starts, and what is already at the top of it.
 *
 * The body is the run of lines indented further than the choice itself. A choice
 * with none gets its first body line invented, indented four further — matching
 * the style the seeded projects are written in.
 */
function bodyOf(
  lines: Line[],
  index: number,
  choiceIndent: string
): { indent: string; at: number; effects: EffectLine[] } {
  const own = indentWidth(choiceIndent)
  const fallback = { indent: `${choiceIndent}    `, at: lines[index]!.to, effects: [] }

  const first = lines[index + 1]
  if (!first || first.text.trim().length === 0) return fallback
  if (indentWidth(first.text) <= own) return fallback

  const indent = indentOf(first.text)
  const effects: EffectLine[] = []

  for (let at = index + 1; at < lines.length; at++) {
    const line = lines[at]!
    if (line.text.trim().length === 0 || indentWidth(line.text) <= own) break

    const body = line.text.trim()
    if (!body.startsWith('~')) break

    effects.push({
      line: line.number,
      from: line.from,
      to: line.to,
      text: body.slice(1).trim()
    })
  }

  return { indent, at: first.from, effects }
}

/** The choice a document offset falls on, or null. */
export function choiceAt(source: string, offset: number): ChoiceRef | null {
  return (
    scanChoices(source).find((choice) => offset >= choice.lineFrom && offset <= choice.lineTo) ?? null
  )
}
