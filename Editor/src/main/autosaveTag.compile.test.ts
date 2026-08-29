import { describe, expect, it } from 'vitest'
import { Compiler } from 'inkjs/compiler/Compiler'
import { parseTag } from '@shared/bundle/tagSpec'

/** Proves the checkpoint syntax against Ink rather than assuming tag timing. */
describe('autosave tag, compiled', () => {
  it('arrives with the first line inside a knot', () => {
    const story = new Compiler(`-> chapter
=== chapter ===
# autosave
The chapter begins.
-> END
`).Compile()

    expect(story.Continue()).toBe('The chapter begins.\n')
    expect((story.currentTags ?? []).map(parseTag)).toContainEqual({ kind: 'autosave' })
  })
})
