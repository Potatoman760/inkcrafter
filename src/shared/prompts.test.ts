import { describe, expect, it } from 'vitest'
import { emptyPromptOverrides, isOverridden, promptFor } from './prompts'

/**
 * Two prompts are replaced and one is only added to, and the difference is the
 * whole of this module. Stated once here rather than at the three call sites,
 * where the odd one out would eventually be written like its neighbours.
 */

const BUILT = 'You are the assistant.'

describe('promptFor', () => {
  it('ships the built-in prompt when nothing is set', () => {
    expect(promptFor('prose', BUILT, emptyPromptOverrides())).toBe(BUILT)
    expect(promptFor('ink', BUILT, emptyPromptOverrides())).toBe(BUILT)
    expect(promptFor('assistant', BUILT, emptyPromptOverrides())).toBe(BUILT)
  })

  it('replaces the prose and ink prompts outright', () => {
    const mine = { ...emptyPromptOverrides(), prose: 'Write it my way.', ink: 'Ink, my way.' }

    expect(promptFor('prose', BUILT, mine)).toBe('Write it my way.')
    expect(promptFor('ink', BUILT, mine)).toBe('Ink, my way.')
  })

  /**
   * The one that must not be a replacement. The assistant's prompt carries its
   * tool table and file formats; a prompt without them reads fine and quietly
   * cannot call anything.
   */
  it('adds to the assistant rather than replacing it', () => {
    const mine = { ...emptyPromptOverrides(), assistant: 'Always write in present tense.' }
    const sent = promptFor('assistant', BUILT, mine)

    expect(sent.startsWith(BUILT)).toBe(true)
    expect(sent).toContain('Always write in present tense.')
  })

  it('marks the addition as the author speaking, not the app', () => {
    const mine = { ...emptyPromptOverrides(), assistant: 'Second person, please.' }

    expect(promptFor('assistant', BUILT, mine)).toContain('FROM THE AUTHOR')
  })

  /** Whitespace is not an instruction, and must not look like one. */
  it('treats an empty or blank override as nothing at all', () => {
    expect(promptFor('prose', BUILT, { ...emptyPromptOverrides(), prose: '   ' })).toBe(BUILT)
    expect(promptFor('assistant', BUILT, { ...emptyPromptOverrides(), assistant: '  \n ' })).toBe(
      BUILT
    )
  })
})

describe('isOverridden', () => {
  it('is false for a fresh set', () => {
    const fresh = emptyPromptOverrides()

    expect(isOverridden(fresh, 'prose')).toBe(false)
    expect(isOverridden(fresh, 'ink')).toBe(false)
    expect(isOverridden(fresh, 'assistant')).toBe(false)
  })

  it('is true once something is set', () => {
    expect(isOverridden({ ...emptyPromptOverrides(), prose: 'x' }, 'prose')).toBe(true)
    expect(isOverridden({ ...emptyPromptOverrides(), assistant: 'x' }, 'assistant')).toBe(true)
  })

  /**
   * An empty string is how the prose editor arrives after the author selects
   * everything and deletes it. That is a request for the default back, not a
   * request for no prompt at all.
   */
  it('is false for an override that says nothing', () => {
    expect(isOverridden({ ...emptyPromptOverrides(), assistant: '   ' }, 'assistant')).toBe(false)
  })
})
