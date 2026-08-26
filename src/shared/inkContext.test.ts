import { describe, expect, it } from 'vitest'
import { editorContextAt, lineAt } from './inkContext'

const SOURCE = `VAR strength = 0

=== the_door ===
# bg:the_cove/night
# char:wren/happy
The door is shut.
~ strength = strength + 1
~ trust = trust + roll(6)

* {strength >= 1} [Force it]
    # char:wren/angry
    -> END

= inside
Shelves.
# trust:-2
Tagged, but not media.
`

const at = (needle: string, offset = 0): ReturnType<typeof editorContextAt> =>
  editorContextAt(SOURCE, SOURCE.indexOf(needle) + offset)

describe('editorContextAt', () => {
  it('knows a choice line', () => {
    const context = at('* {strength >= 1}')
    expect(context.kind).toBe('choice')
    if (context.kind === 'choice') expect(context.choice.text).toContain('[Force it]')
  })

  it('knows a background tag', () => {
    const context = at('# bg:the_cove')
    expect(context.kind).toBe('media')
    if (context.kind === 'media') {
      expect(context.tag.ref).toMatchObject({ kind: 'background', name: 'the_cove', variant: 'night' })
    }
  })

  it('knows a character tag', () => {
    const context = at('# char:wren/happy')
    expect(context.kind).toBe('media')
    if (context.kind === 'media') expect(context.tag.ref.kind).toBe('character')
  })

  it('gives the tag a span that replaces the body and not the hash', () => {
    const context = at('# bg:the_cove')
    if (context.kind !== 'media') throw new Error('expected media')

    expect(SOURCE.slice(context.tag.from, context.tag.to)).toBe('bg:the_cove/night')
  })

  it('reads back a stat change it could have written', () => {
    const context = at('~ strength =')
    expect(context.kind).toBe('effect')
    if (context.kind === 'effect') {
      expect(context.effect).toMatchObject({ kind: 'stat', name: 'strength', change: 'add' })
      expect(SOURCE.slice(context.from, context.to)).toBe('strength = strength + 1')
    }
  })

  /**
   * A `~` line the app did not write stays plain logic. Reshaping someone's
   * `roll(6)` through two dropdowns is how you mangle a file.
   */
  it('leaves logic it cannot read back as logic', () => {
    expect(at('~ trust').kind).toBe('logic')
  })

  it('knows a knot header, and a stitch', () => {
    expect(at('=== the_door ===').kind).toBe('header')
    expect(at('= inside').kind).toBe('header')
  })

  it('treats ordinary prose as prose', () => {
    expect(at('The door is shut.').kind).toBe('prose')
  })

  /**
   * ink carries tags for other purposes — the archive example has
   * `#trust:{archivist_trust}`, which arrives interpolated. A line tagged with
   * something that is not media is not a media line.
   */
  it('does not claim a tag that is not media', () => {
    expect(at('# trust:-2').kind).toBe('prose')
  })

  // A choice can carry a tag too, and gating it is the likelier intent than
  // editing the tag hanging off it.
  it('prefers the choice when a line is both', () => {
    const source = '* [Go] # char:wren/happy\n    -> END\n'
    expect(editorContextAt(source, 3).kind).toBe('choice')
  })

  it('finds the tag on an indented line inside a choice body', () => {
    const context = at('    # char:wren/angry', 6)
    expect(context.kind).toBe('media')
  })

  it('works at either end of a line', () => {
    const start = SOURCE.indexOf('# bg:the_cove')
    expect(editorContextAt(SOURCE, start).kind).toBe('media')
    expect(editorContextAt(SOURCE, start + '# bg:the_cove/night'.length).kind).toBe('media')
  })

  /* State tags: the other half of the vocabulary ---------------------------- */

  const state = (text: string, offset = 0): ReturnType<typeof editorContextAt> =>
    editorContextAt(`${text}\n`, offset)

  it('knows a cast change, and which attribute it names', () => {
    const context = state('    # npc: abeline affection +2', 8)
    expect(context.kind).toBe('stateTag')
    if (context.kind === 'stateTag') {
      expect(context.tag.command).toMatchObject({
        kind: 'npc',
        id: 'abeline',
        attr: 'affection',
        op: '+',
        value: '2'
      })
    }
  })

  it('knows a player stat change', () => {
    const context = state('# stat: courage +1', 4)
    expect(context.kind).toBe('stateTag')
    if (context.kind === 'stateTag') {
      expect(context.tag.command).toMatchObject({ kind: 'stat', stat: 'courage', value: 1 })
    }
  })

  it('gives it a span that replaces the body and not the hash', () => {
    const source = '    # npc: abeline affection +2\n'
    const context = editorContextAt(source, 10)
    if (context.kind !== 'stateTag') throw new Error('expected a state tag')

    expect(source.slice(context.tag.from, context.tag.to)).toBe('npc: abeline affection +2')
  })

  /**
   * A tag whose key is ours but whose value cannot be read is left alone. The
   * menu would have to guess what it meant, and guessing is how a half-typed
   * line gets rewritten into something the author did not write.
   */
  it('does not claim a state tag it cannot read', () => {
    expect(state('# npc: abeline', 5).kind).toBe('prose')
    expect(state('# stat: courage up a bit', 5).kind).toBe('prose')
  })

  it('reaches the second tag on a line when that is the one clicked', () => {
    const source = '# bg: cove # npc: abeline affection +2\n'
    expect(editorContextAt(source, 4).kind).toBe('media')
    expect(editorContextAt(source, 20).kind).toBe('stateTag')
  })

  // A tag the menu has nothing to offer for should not swallow the line: the
  // ordinary actions are more use there than a dead end.
  it('leaves a speaker tag as prose', () => {
    expect(state('# speaker: Sister Abeline', 5).kind).toBe('prose')
  })
})

describe('lineAt', () => {
  it('reports a 1-based line number and the text without its newline', () => {
    const line = lineAt(SOURCE, SOURCE.indexOf('The door is shut.'))
    expect(line.line).toBe(6)
    expect(line.text).toBe('The door is shut.')
  })

  it('keeps the indentation for an edit to match', () => {
    expect(lineAt(SOURCE, SOURCE.indexOf('    # char:wren/angry') + 6).indent).toBe('    ')
  })

  it('leaves a carriage return out of the span, so an edit cannot land inside it', () => {
    const crlf = 'one\r\ntwo\r\n'
    const line = lineAt(crlf, 1)
    expect(line.text).toBe('one')
    expect(crlf.slice(line.from, line.to)).toBe('one')
  })

  it('handles the last line with no trailing newline', () => {
    expect(lineAt('only', 2)).toMatchObject({ line: 1, text: 'only' })
  })
})
