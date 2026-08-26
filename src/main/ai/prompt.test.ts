import { describe, expect, it } from 'vitest'
import { INK_KEYWORDS, INK_UNSAFE_ANYWHERE, INK_UNSAFE_AT_LINE_START } from '@shared/inkProse'
import type { WriteSectionRequest } from '@shared/ai'
import { emptyManuscript } from '@shared/manuscript'
import { SYSTEM_PROMPT, composePrompt } from './prompt'

/**
 * The prompt asks; `inkProse.ts` enforces. When they disagree the model is being
 * told one thing and judged by another, and the author sees paragraphs vanish
 * from a draft that followed its instructions to the letter.
 */
describe('SYSTEM_PROMPT agrees with the guard', () => {
  for (const token of INK_UNSAFE_ANYWHERE) {
    it(`warns about ${token}`, () => {
      const mentioned = token === '\\' ? /backslash/.test(SYSTEM_PROMPT) : SYSTEM_PROMPT.includes(token)
      expect(mentioned).toBe(true)
    })
  }

  for (const keyword of INK_KEYWORDS) {
    it(`names ${keyword} as a line ink would read as a declaration`, () => {
      expect(SYSTEM_PROMPT).toContain(keyword)
    })
  }

  it('names every character that changes meaning at the start of a line', () => {
    const line = SYSTEM_PROMPT.split('\n').find((text) => text.includes('Never begin a line with'))
    expect(line).toBeDefined()
    for (const character of INK_UNSAFE_AT_LINE_START) expect(line).toContain(character)
  })

  it('does not ban DONE or END, which are safe as prose', () => {
    // They only mean anything after a ->. Banning them would cost the author
    // ordinary sentences; the compile test proves they survive untouched.
    expect(SYSTEM_PROMPT).not.toMatch(/\bDONE\b/)
    expect(SYSTEM_PROMPT).not.toMatch(/\bEND\b/)
  })

  it('does not ban >, which ink has no opinion about', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/line with [*+\-=~ ]*>/)
  })

  it('tells the model a paragraph is a beat, not a novel paragraph', () => {
    expect(SYSTEM_PROMPT).toMatch(/one line of ink/)
    expect(SYSTEM_PROMPT).toMatch(/beat/)
  })

  it('gives the two dialogue forms that survive compilation', () => {
    expect(SYSTEM_PROMPT).toMatch(/Speech in quotes inside the narration/)
    expect(SYSTEM_PROMPT).toMatch(/speaker in front of it/)
    expect(SYSTEM_PROMPT).toMatch(/Never open a line with a hyphen/)
  })
})

describe('composePrompt', () => {
  const manuscript = emptyManuscript('/p/ink/main.ink', 'ink/main.ink')
  const request = (
    overrides: Partial<WriteSectionRequest> = {}
  ): WriteSectionRequest => ({
    sectionIndex: 0,
    instruction: 'Open the scene.',
    maxWords: 200,
    providerId: 'prv_0000000000',
    model: 'a-model',
    ...overrides
  })

  it('carries the system prompt through unchanged', () => {
    const { system } = composePrompt(manuscript, request())

    expect(system).toBe(SYSTEM_PROMPT)
  })

  it('says outright when there is no story before this section', () => {
    const { user } = composePrompt(manuscript, request())

    expect(user).toContain('This is the opening of the story; nothing precedes it.')
    expect(user).toContain('Open the scene.')
    expect(user).toContain('Write at most 200 words.')
  })

  it('falls back to a usable instruction rather than an empty one', () => {
    const { user } = composePrompt(manuscript, request({ instruction: '   ', maxWords: 400 }))

    expect(user).toContain('Continue the scene.')
  })
})
