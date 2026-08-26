import { parseTag, type StateCommand } from './bundle/tagSpec'
import { choiceAt, type ChoiceRef, type Span } from './inkChoices'
import { parseEffect, type EffectRef } from './inkEdits'
import { isMediaTag, parseMediaTag, type MediaTagRef } from './mediaTag'

/**
 * What the cursor is sitting on.
 *
 * The right-click menu offers different things in different places, and the
 * point is not tidiness: on a `# bg:courtyard` line, "change stat" is not a near
 * miss, it is an option that cannot mean anything there. Working out where you
 * are is the menu's first job rather than a refinement of it.
 */

export interface LineSpan extends Span {
  /** 1-based. */
  line: number
  /** The line's text, without its newline. */
  text: string
  indent: string
}

export interface MediaTagAt {
  ref: MediaTagRef
  /** The tag body's span, after the `#` and trimmed — what a change replaces. */
  from: number
  to: number
}

/** A `# stat:` or `# npc:` tag: a change to something the game tracks. */
export interface StateTagAt {
  command: StateCommand
  from: number
  to: number
}

export type EditorContext =
  | { kind: 'choice'; line: LineSpan; choice: ChoiceRef }
  /** A line carrying a media tag, e.g. `# bg:courtyard`. */
  | { kind: 'media'; line: LineSpan; tag: MediaTagAt }
  /** A line carrying a state change, e.g. `# npc: abeline affection +2`. */
  | { kind: 'stateTag'; line: LineSpan; tag: StateTagAt }
  /** A `~` line the menu recognises as one of its own. */
  | { kind: 'effect'; line: LineSpan; effect: EffectRef; from: number; to: number }
  /** A `~` line that is something else — hand-written, compound, a call. */
  | { kind: 'logic'; line: LineSpan }
  /** A knot or stitch header, where neither a tag nor logic belongs. */
  | { kind: 'header'; line: LineSpan }
  | { kind: 'prose'; line: LineSpan }

export function lineAt(source: string, offset: number): LineSpan {
  const at = Math.max(0, Math.min(offset, source.length))
  const from = source.lastIndexOf('\n', Math.max(0, at - 1)) + 1

  let to = source.indexOf('\n', from)
  if (to === -1) to = source.length
  if (to > from && source[to - 1] === '\r') to--

  const text = source.slice(from, to)

  return {
    from,
    to,
    line: source.slice(0, from).split('\n').length,
    text,
    indent: /^[ \t]*/.exec(text)![0]
  }
}

interface TagAt {
  /** The tag body, without the `#` and without the space after it. */
  body: string
  from: number
  to: number
}

/**
 * Every tag on a line, with the span a change would replace.
 *
 * Each runs from its `#` to the next one, so two tags on a line keep their own
 * spans, and each is trimmed so replacing one does not swallow the space after
 * the hash.
 */
function tagsOn(line: LineSpan): TagAt[] {
  const found: TagAt[] = []

  for (let hash = line.text.indexOf('#'); hash !== -1; ) {
    const next = line.text.indexOf('#', hash + 1)
    const bodyEnd = next === -1 ? line.text.length : next
    const body = line.text.slice(hash + 1, bodyEnd)

    const leading = body.length - body.trimStart().length
    const trailing = body.length - body.trimEnd().length

    found.push({
      body: body.trim(),
      from: line.from + hash + 1 + leading,
      to: line.from + bodyEnd - trailing
    })

    hash = next
  }

  return found
}

/** What one tag is, or null when it is not something the menu can edit. */
function classify(line: LineSpan, tag: TagAt): EditorContext | null {
  const ref = isMediaTag(tag.body) ? parseMediaTag(tag.body) : null
  if (ref) return { kind: 'media', line, tag: { ref, from: tag.from, to: tag.to } }

  const command = parseTag(tag.body)
  if (command && (command.kind === 'stat' || command.kind === 'npc')) {
    return { kind: 'stateTag', line, tag: { command, from: tag.from, to: tag.to } }
  }

  return null
}

/**
 * The tag a click landed on, or failing that the first one the menu can edit.
 *
 * Preferring the one under the pointer is what makes a second tag on a line
 * reachable at all; falling back to the first keeps a click on the prose after
 * a tag doing what it always did.
 */
function tagAt(line: LineSpan, offset: number): EditorContext | null {
  const tags = tagsOn(line)

  const under = tags.find((tag) => offset >= tag.from - 1 && offset <= tag.to)
  const here = under ? classify(line, under) : null
  if (here) return here

  for (const tag of tags) {
    const context = classify(line, tag)
    if (context) return context
  }

  return null
}

export function editorContextAt(source: string, offset: number): EditorContext {
  const line = lineAt(source, offset)

  // A choice first: a choice line may also carry a tag, and gating it is the
  // more likely intent than editing the tag hanging off it.
  const choice = choiceAt(source, offset)
  if (choice) return { kind: 'choice', line, choice }

  const tag = tagAt(line, offset)
  if (tag) return tag

  const body = line.text.trim()

  if (body.startsWith('~')) {
    const effect = parseEffect(body)
    if (!effect) return { kind: 'logic', line }

    // The span of the logic itself, so an edit keeps the `~` and its spacing.
    const tilde = line.text.indexOf('~')
    const after = line.text.slice(tilde + 1)
    const leading = after.length - after.trimStart().length

    return {
      kind: 'effect',
      line,
      effect,
      from: line.from + tilde + 1 + leading,
      to: line.from + line.text.trimEnd().length
    }
  }

  if (body.startsWith('=')) return { kind: 'header', line }

  return { kind: 'prose', line }
}
