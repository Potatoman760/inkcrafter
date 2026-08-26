import { describe, expect, it } from 'vitest'
import { Compiler } from 'inkjs/compiler/Compiler'
import type { WriteInkRequest } from '@shared/ai'
import { newEntry, type CodexEntry } from '@shared/codex'
import { planFromMarkdown, type PlanDocument } from '@shared/planDoc'
import { composeInkPrompt, INK_SYSTEM_PROMPT, renderFilePlanContext } from './inkPrompt'

const FILE = `// Arrival

VAR trusted = false

=== the_winch ===
The winch complains all the way up. Idris does not look at the boat.

* [Go on]
    -> papers

=== papers ===
Vance holds out the folder.
-> END

=== function place_name(id) ===
~ return "somewhere"
`

function request(overrides: Partial<WriteInkRequest> = {}): WriteInkRequest {
  return {
    filePath: 'ink/chapters/arrival.ink',
    source: FILE,
    instruction: 'Add a choice that refuses.',
    selection: '',
    providerId: 'prv_0000000000',
    model: 'a-model',
    ...overrides
  }
}

function entry(name: string): CodexEntry {
  return { ...newEntry('lib_0000000000', name, 'character', name.toLowerCase()), id: `cdx_${name}` }
}

function planWith(files: string[]): PlanDocument {
  const plan = planFromMarkdown(
    '# The Island\n\nEverything happens between the cove and the lantern room.\n\n' +
      '## Arrival\n\nVance lands at the cove with papers to close the station.\n\n' +
      '### The winch\n\nThe cable, and who works it.\n\n' +
      '### Papers\n\nThe folder changes hands.\n\n' +
      '## The Lamp\n\nWhat the light is for.\n'
  )
  const chapter = plan.nodes[0]!.children[0]!
  const scene = chapter.children[0]!
  return {
    ...plan,
    nodes: [
      {
        ...plan.nodes[0]!,
        children: [
          {
            ...chapter,
            children: [{ ...scene, files }, ...chapter.children.slice(1)]
          },
          ...plan.nodes[0]!.children.slice(1)
        ]
      }
    ]
  }
}

/**
 * The prompt teaches ink rather than banning it, which means it makes claims
 * about the language. The bracket rule is the one worth pinning down: both forms
 * compile, and they tell different stories, so a wrong explanation produces ink
 * that works and is not what the author asked for.
 */
describe('INK_SYSTEM_PROMPT', () => {
  const play = (source: string, pick = 0): { choices: string[]; after: string } => {
    const story = new Compiler(source).Compile()
    while (story.canContinue) story.Continue()
    const choices = story.currentChoices.map((choice) => choice.text ?? '')

    let after = ''
    if (choices.length > pick) {
      story.ChooseChoiceIndex(pick)
      while (story.canContinue) after += story.Continue()
    }
    return { choices, after }
  }

  const wrap = (body: string): string => `-> start\n=== start ===\n${body}\n=== next ===\nNEXT.\n-> END\n`

  it('is right that an unbracketed choice is also printed once taken', () => {
    const { choices, after } = play(wrap('* Try the handle\n    -> next'))
    expect(choices).toEqual(['Try the handle'])
    expect(after).toBe('Try the handle\nNEXT.\n')
  })

  it('is right that a fully bracketed choice prints nothing', () => {
    const { choices, after } = play(wrap('* [Try the handle]\n    -> next'))
    expect(choices).toEqual(['Try the handle'])
    expect(after).toBe('NEXT.\n')
  })

  it('is right about the three-part form it recommends for dialogue', () => {
    // The exact example given in the prompt.
    const { choices, after } = play(wrap('* "Hello[."]," she said.\n    -> next'))
    expect(choices).toEqual(['"Hello."'])
    expect(after).toBe('"Hello," she said.\nNEXT.\n')
  })

  it('is right that a gather brings branches back together', () => {
    const { after } = play(wrap('* [First]\n    A.\n* [Second]\n    B.\n- Both arrive here.\n-> next'))
    expect(after).toBe('A.\nBoth arrive here.\nNEXT.\n')
  })

  it('states the rule in the terms the compiler actually follows', () => {
    expect(INK_SYSTEM_PROMPT).toMatch(/before \[ appears in both/)
    expect(INK_SYSTEM_PROMPT).toMatch(/inside \[ \] appears only in the list of choices/)
    expect(INK_SYSTEM_PROMPT).toMatch(/after \] appears only once the choice is taken/)
  })

  it('says a path must end somewhere, which is the other common compile error', () => {
    expect(INK_SYSTEM_PROMPT).toMatch(/runs off the end is a compile error/)
    expect(INK_SYSTEM_PROMPT).toMatch(/never divert to a knot that does not/)
  })

  it('does not impose a word limit, since the unit here is structure', () => {
    expect(INK_SYSTEM_PROMPT).not.toMatch(/\bwords\b/)
  })
})

describe('composeInkPrompt', () => {
  it('sends the whole file, named', () => {
    const { user } = composeInkPrompt(request())
    expect(user).toContain('ink/chapters/arrival.ink')
    expect(user).toContain('The winch complains all the way up')
  })

  it('names the knots that already exist, and leaves functions out of the list', () => {
    const { user } = composeInkPrompt(request())
    const list = /KNOTS THAT ALREADY EXIST[^\n]*\n(.+)/.exec(user)?.[1]

    expect(list).toBe('the_winch, papers')
    // A function is called, never diverted to, so offering it as a target
    // would only invite a compile error.
    expect(list).not.toContain('place_name')
  })

  it('says what a selection would replace', () => {
    const { user } = composeInkPrompt(request({ selection: 'Vance holds out the folder.' }))
    expect(user).toMatch(/HAS SELECTED THIS[\s\S]*Vance holds out the folder/)
  })

  it('says outright when nothing is selected', () => {
    expect(composeInkPrompt(request()).user).toMatch(/Nothing is selected/)
  })

  it('falls back to a usable instruction', () => {
    expect(composeInkPrompt(request({ instruction: '  ' })).user).toContain('Continue this file.')
  })

  it('carries the codex entries named anywhere in what is sent', () => {
    // Idris is in the file but not in the instruction: scanning only the
    // instruction would send the model a character it has never heard of.
    const { user } = composeInkPrompt(request(), { codex: [entry('Idris'), entry('Mara')] })

    expect(user).toContain('Idris')
    expect(user).not.toContain('Mara')
  })

  it('carries what the plan says the file is for', () => {
    const { user } = composeInkPrompt(request(), {
      plan: planWith(['ink/chapters/arrival.ink'])
    })

    expect(user).toContain('The Island › Arrival › The winch')
    expect(user).toContain('Vance lands at the cove')
  })

  it('leaves the plan out when the file is attached to nothing', () => {
    const { user } = composeInkPrompt(request(), { plan: planWith(['ink/other.ink']) })
    expect(user).not.toContain('PLAN —')
  })

  it('truncates a file too long to send whole, and says so', () => {
    const { user } = composeInkPrompt(request({ source: 'A line.\n'.repeat(6000) }))
    expect(user).toContain('the rest of the file is omitted')
  })
})

describe('renderFilePlanContext', () => {
  const plan = planWith(['ink/chapters/arrival.ink'])

  it('describes the Scene that owns the file', () => {
    const rendered = renderFilePlanContext(plan, 'ink/chapters/arrival.ink')

    expect(rendered).toContain('The winch')
    expect(rendered).toContain('The cable, and who works it.')
  })

  it('carries its containers and the Scene that follows it', () => {
    const rendered = renderFilePlanContext(plan, 'ink/chapters/arrival.ink')

    expect(rendered).toMatch(/The act "The Island": Everything happens/)
    expect(rendered).toMatch(/The chapter "Arrival": Vance lands/)
    expect(rendered).toMatch(/What follows: Papers/)
  })

  it('is empty for a file the plan does not know', () => {
    expect(renderFilePlanContext(plan, 'ink/nowhere.ink')).toBe('')
  })
})
