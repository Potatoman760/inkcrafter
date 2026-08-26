import { describe, expect, it } from 'vitest'
import { Compiler, CompilerOptions } from 'inkjs/compiler/Compiler'
import { inkHazardIn } from '@shared/inkProse'
import { sanitiseDraft } from './compose'

/**
 * Keeps `inkProse.ts` honest.
 *
 * Every rule in that module is a claim about what the ink compiler does, and a
 * claim about a compiler is worth exactly nothing until the compiler has been
 * asked. So this runs prose through the real thing: what the guard allows must
 * compile and come back word for word, and what the guard rejects must genuinely
 * be dangerous — otherwise it is deleting the author's writing for no reason.
 */

interface Compiled {
  errors: string[]
  output: string
  choices: string[]
}

/** Compiles paragraphs laid out the way `insertAfterSection` writes them. */
function compileProse(paragraphs: string[]): Compiled {
  const source = `-> start\n=== start ===\n${paragraphs.join('\n\n')}\n-> DONE\n`
  const errors: string[] = []

  try {
    const options = new CompilerOptions(null, [], false, (message: string, type: number) => {
      if (type !== 0) errors.push(message.trim())
    })
    const story = new Compiler(source, options).Compile()

    let output = ''
    while (story.canContinue) output += story.Continue()

    return { errors, output, choices: story.currentChoices.map((choice) => choice.text ?? '') }
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : String(cause))
    return { errors, output: '', choices: [] }
  }
}

const SAFE = [
  'She arrives at the archive after hours.',
  '"I told you," she said.',
  "'I told you,' she said.",
  '\u201cI told you,\u201d she said.',
  'Wren: "You\'re late."',
  "It doesn't matter.",
  'She waited\u2026 nothing.',
  'She waited \u2014 nothing came.',
  '\u2014 I told you, she said.',
  '> She arrives.',
  'She read [the sign].',
  'A 50% chance.',
  'Salt & pepper.',
  '1996 was the year.',
  'A minus-sign 3-4 thing.',
  'The DONER kebab shop was shut.',
  // DONE and END are diverts only after a ->; as words they are just words.
  'END of the line, she thought.',
  'DONE is what she said.'
]

const UNSAFE = [
  'She counted {one} thing.',
  'A choice | another.',
  'She pointed -> that way.',
  'A <- b.',
  'The address was http://example.com.',
  'She was in Room #3 by then.',
  'She waited <> then left.',
  'A path like C:\\ink.',
  '- I told you, she said.',
  '* She arrives.',
  '+ She arrives.',
  '= She arrives.',
  '~ She arrives.',
  '# She arrives.',
  'TODO: fix this later.',
  'TODO the list, she thought.',
  'INCLUDE the whole room in your search.',
  'VAR was her nickname.',
  'CONST is a strange word.',
  'LIST the reasons, she said.',
  'EXTERNAL forces, she thought.'
]

describe('prose the guard allows', () => {
  for (const text of SAFE) {
    it(`compiles and reads back verbatim: ${JSON.stringify(text)}`, () => {
      expect(inkHazardIn(text)).toBeNull()

      const { errors, output, choices } = compileProse([text])
      expect(errors).toEqual([])
      expect(output).toBe(`${text}\n`)
      expect(choices).toEqual([])
    })
  }

  it('keeps each paragraph a separate beat', () => {
    // The formatting claim the system prompt rests on: one paragraph in, one
    // line out, which is one thing the reader clicks through.
    const { errors, output } = compileProse(['She arrives.', 'The door is shut.', 'Nobody answers.'])

    expect(errors).toEqual([])
    expect(output).toBe('She arrives.\nThe door is shut.\nNobody answers.\n')
  })

  it('renders both safe dialogue forms as written', () => {
    const { errors, output } = compileProse([
      'She did not look up. "You\'re late."',
      'Wren: "Everyone is expected. That\'s the point of a door."'
    ])

    expect(errors).toEqual([])
    expect(output).toBe(
      'She did not look up. "You\'re late."\nWren: "Everyone is expected. That\'s the point of a door."\n'
    )
  })
})

describe('prose the guard rejects', () => {
  for (const text of UNSAFE) {
    it(`is genuinely unsafe, not merely suspicious: ${JSON.stringify(text)}`, () => {
      expect(inkHazardIn(text)).not.toBeNull()

      const { errors, output, choices } = compileProse([text])
      const intact = errors.length === 0 && output === `${text}\n` && choices.length === 0

      // Either ink refuses it, or it survives compilation as something other
      // than the sentence that went in. If it came back untouched the guard is
      // throwing away good writing.
      expect(intact).toBe(false)
    })
  }

  it('drops a hazardous paragraph and keeps the rest', () => {
    const draft = 'She arrives.\n\nShe pointed -> that way.\n\nThe door is shut.'
    expect(sanitiseDraft(draft)).toEqual(['She arrives.', 'The door is shut.'])
  })

  it('joins a paragraph the model wrapped, so it lands as one beat', () => {
    const draft = 'She arrives at the archive\nafter hours, and finds\nthe door shut.'
    const paragraphs = sanitiseDraft(draft)

    expect(paragraphs).toEqual(['She arrives at the archive after hours, and finds the door shut.'])

    const { errors, output } = compileProse(paragraphs)
    expect(errors).toEqual([])
    expect(output).toBe('She arrives at the archive after hours, and finds the door shut.\n')
  })
})
