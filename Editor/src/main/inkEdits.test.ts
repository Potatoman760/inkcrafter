import { describe, expect, it } from 'vitest'
import { Compiler, CompilerOptions } from 'inkjs/compiler/Compiler'
import { choiceAt, scanChoices } from '@shared/inkChoices'
import {
  addCondition,
  parseEffect,
  renderEffect,
  addEffect,
  addEffectAtLine,
  flagCondition,
  flagEffect,
  itemCondition,
  itemEffect,
  removeCondition,
  statCondition,
  statEffect,
  type TextEdit
} from '@shared/inkEdits'

/**
 * These produce ink, so the compiler is the judge. An edit that reads correctly
 * and does not compile — or compiles and gates the wrong way — is the failure
 * worth catching, and neither is visible by looking at the string.
 */

const STORY = `VAR strength = 0
VAR has_met_wren = false
LIST Tools = shovel, rope
VAR inventory = ()

-> the_door

=== the_door ===
The door is shut.

* [Try the handle]
    It turns.
    -> inside

* {strength >= 1} [Force it]
    -> inside

* [Wait]
    -> inside

=== inside ===
Inside.
-> END
`

function apply(source: string, edit: TextEdit): string {
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to)
}

interface Run {
  errors: string[]
  choices: string[]
}

function play(source: string): Run {
  const errors: string[] = []
  const options = new CompilerOptions(null, [], false, (message: string, type: number) => {
    if (type !== 0) errors.push(message.trim())
  })

  try {
    const story = new Compiler(source, options).Compile()
    while (story.canContinue) story.Continue()
    return { errors, choices: story.currentChoices.map((choice) => choice.text ?? '') }
  } catch (cause) {
    return { errors: errors.length ? errors : [String(cause)], choices: [] }
  }
}

const pick = (source: string, text: string): ReturnType<typeof choiceAt> =>
  scanChoices(source).find((choice) => choice.text.includes(text)) ?? null

describe('scanChoices', () => {
  it('finds every choice and skips gathers and diverts', () => {
    const found = scanChoices(STORY)
    expect(found.map((choice) => choice.text)).toEqual([
      '[Try the handle]',
      '[Force it]',
      '[Wait]'
    ])
  })

  it('reads the condition a choice already has, and where it sits', () => {
    const choice = pick(STORY, 'Force it')!
    expect(choice.condition?.text).toBe('strength >= 1')
    expect(STORY.slice(choice.condition!.from, choice.condition!.to)).toBe('{strength >= 1}')
  })

  it('records nesting depth and the marker', () => {
    const nested = scanChoices('* [One]\n    ** [Two]\n+ [Sticky]\n')
    expect(nested.map((choice) => [choice.depth, choice.marker])).toEqual([
      [1, '*'],
      [2, '*'],
      [1, '+']
    ])
  })

  it('does not mistake a gather or a divert for a choice', () => {
    expect(scanChoices('- A gather.\n-> somewhere\n-- deeper gather\n')).toEqual([])
  })

  it('steps over a label, which sits before the condition', () => {
    const choice = scanChoices('* (again) {strength > 0} [Try]\n')[0]!
    expect(choice.condition?.text).toBe('strength > 0')
    expect(choice.text).toBe('[Try]')
  })

  it('collects the effect lines already at the top of a body', () => {
    const source = '* [Take it]\n    ~ strength = strength + 1\n    ~ has_met_wren = true\n    You take it.\n'
    expect(scanChoices(source)[0]!.effects.map((effect) => effect.text)).toEqual([
      'strength = strength + 1',
      'has_met_wren = true'
    ])
  })

  it('finds the choice an offset falls on, and nothing when it does not', () => {
    const line = STORY.indexOf('* [Wait]')
    expect(choiceAt(STORY, line + 3)?.text).toBe('[Wait]')
    expect(choiceAt(STORY, STORY.indexOf('The door is shut.'))).toBeNull()
  })

  it('survives an unclosed brace rather than swallowing the line', () => {
    const choice = scanChoices('* {strength > 0 [Try]\n')[0]!
    expect(choice.condition).toBeNull()
  })
})

describe('addCondition', () => {
  it('gates a choice that had none, and the gate works', () => {
    const choice = pick(STORY, 'Try the handle')!
    const next = apply(STORY, addCondition(choice, itemCondition('inventory', 'shovel', true)))

    expect(next).toContain('* {inventory ? shovel} [Try the handle]')

    const { errors, choices } = play(next)
    expect(errors).toEqual([])
    // Gated out: nothing has put the shovel in the inventory.
    expect(choices).toEqual(['Wait'])
  })

  it('widens a condition that already exists, keeping the original text', () => {
    const choice = pick(STORY, 'Force it')!
    const next = apply(STORY, addCondition(choice, flagCondition('has_met_wren', true)))

    expect(next).toContain('* {strength >= 1 and has_met_wren} [Force it]')
    expect(play(next).errors).toEqual([])
  })

  it('combines with or when asked', () => {
    const choice = pick(STORY, 'Force it')!
    const next = apply(STORY, addCondition(choice, 'strength >= 9', 'or'))

    expect(next).toContain('{strength >= 1 or strength >= 9}')
    expect(play(next).errors).toEqual([])
  })

  // The condition the app could not have written must survive being added to.
  it('carries an expression it cannot parse through untouched', () => {
    const source = '* {inventory ? shovel and LIST_COUNT(inventory) < 3} [Dig]\n    -> END\n'
    const choice = scanChoices(source)[0]!
    const next = apply(source, addCondition(choice, 'strength > 1'))

    expect(next).toContain('{inventory ? shovel and LIST_COUNT(inventory) < 3 and strength > 1}')
  })

  it('leaves every other line of the file exactly as it was', () => {
    const choice = pick(STORY, 'Wait')!
    const next = apply(STORY, addCondition(choice, 'strength > 0'))

    const before = STORY.split('\n')
    const after = next.split('\n')
    const differing = after.filter((line, index) => line !== before[index])

    expect(differing).toEqual(['* {strength > 0} [Wait]'])
  })
})

describe('removeCondition', () => {
  it('takes the condition and its trailing space', () => {
    const choice = pick(STORY, 'Force it')!
    const next = apply(STORY, removeCondition(STORY, choice)!)

    expect(next).toContain('* [Force it]')
    expect(play(next).choices).toEqual(['Try the handle', 'Force it', 'Wait'])
  })

  it('has nothing to do on a choice with no condition', () => {
    expect(removeCondition(STORY, pick(STORY, 'Wait')!)).toBeNull()
  })
})

describe('addEffect', () => {
  it('puts the line at the top of an existing body, where it will run', () => {
    const choice = pick(STORY, 'Try the handle')!
    const next = apply(STORY, addEffect(choice, statEffect('strength', 'add', '1')))

    expect(next).toContain('* [Try the handle]\n    ~ strength = strength + 1\n    It turns.')
    expect(play(next).errors).toEqual([])
  })

  it('starts a body on a choice that has none', () => {
    const source = '-> s\n=== s ===\n* [Take it]\n- -> END\n'
    const choice = scanChoices(source)[0]!
    const next = apply(source, addEffect(choice, 'strength = 1'))

    expect(next).toContain('* [Take it]\n    ~ strength = 1\n')
    expect(play(`VAR strength = 0\n${next}`).errors).toEqual([])
  })

  it('actually changes the value when the choice is taken', () => {
    const choice = pick(STORY, 'Wait')!
    const withEffect = apply(STORY, addEffect(choice, itemEffect('inventory', 'shovel', true)))

    const story = new Compiler(withEffect).Compile()
    while (story.canContinue) story.Continue()
    story.ChooseChoiceIndex(story.currentChoices.findIndex((c) => c.text === 'Wait'))
    while (story.canContinue) story.Continue()

    expect(String(story.variablesState['inventory'])).toContain('shovel')
  })

  it('matches the indentation of the body it joins', () => {
    const source = '* [One]\n        Deeply indented.\n        -> END\n'
    const next = apply(source, addEffect(scanChoices(source)[0]!, 'x = 1'))

    expect(next).toContain('* [One]\n        ~ x = 1\n        Deeply indented.')
  })
})

describe('addEffectAtLine', () => {
  it('adds a line after the one the cursor is on', () => {
    const source = '=== s ===\nThe door is shut.\n-> END\n'
    const next = apply(source, addEffectAtLine(source, source.indexOf('The door') + 2, 'x = 1'))

    expect(next).toBe('=== s ===\nThe door is shut.\n~ x = 1\n-> END\n')
  })

  it('uses a blank line the cursor is already on rather than adding another', () => {
    const source = '=== s ===\nText.\n\n-> END\n'
    const next = apply(source, addEffectAtLine(source, source.indexOf('\n\n') + 1, 'x = 1'))

    expect(next).toBe('=== s ===\nText.\n~ x = 1\n-> END\n')
  })

  it('keeps the indentation of the line it lands beside', () => {
    const source = '* [One]\n    It turns.\n    -> END\n'
    const next = apply(source, addEffectAtLine(source, source.indexOf('It turns.'), 'x = 1'))

    expect(next).toContain('    It turns.\n    ~ x = 1\n')
  })
})

describe('the vocabulary it writes', () => {
  it('renders conditions ink accepts', () => {
    expect(statCondition('strength', '>=', '3')).toBe('strength >= 3')
    expect(flagCondition('has_met_wren', true)).toBe('has_met_wren')
    expect(flagCondition('has_met_wren', false)).toBe('not has_met_wren')
    expect(itemCondition('inventory', 'shovel', true)).toBe('inventory ? shovel')
    expect(itemCondition('inventory', 'shovel', false)).toBe('not (inventory ? shovel)')
  })

  it('renders effects ink accepts', () => {
    expect(statEffect('strength', 'add', '1')).toBe('strength = strength + 1')
    expect(statEffect('strength', 'subtract', '2')).toBe('strength = strength - 2')
    expect(statEffect('strength', 'set', '5')).toBe('strength = 5')
    expect(flagEffect('has_met_wren', true)).toBe('has_met_wren = true')
    expect(itemEffect('inventory', 'shovel', true)).toBe('inventory += shovel')
    expect(itemEffect('inventory', 'shovel', false)).toBe('inventory -= shovel')
  })

  // Every form above, compiled, because "reads like ink" and "is ink" differ.
  it('compiles every form it can produce', () => {
    const conditions = [
      statCondition('strength', '>=', '3'),
      flagCondition('has_met_wren', true),
      flagCondition('has_met_wren', false),
      itemCondition('inventory', 'shovel', true),
      itemCondition('inventory', 'shovel', false)
    ]
    const effects = [
      statEffect('strength', 'add', '1'),
      statEffect('strength', 'subtract', '2'),
      statEffect('strength', 'set', '5'),
      flagEffect('has_met_wren', true),
      itemEffect('inventory', 'shovel', true),
      itemEffect('inventory', 'rope', false)
    ]

    const source = `VAR strength = 0
VAR has_met_wren = false
LIST Tools = shovel, rope
VAR inventory = ()

-> s

=== s ===
${effects.map((effect) => `~ ${effect}`).join('\n')}
${conditions.map((condition, index) => `* {${condition}} [Option ${index}]\n    -> END`).join('\n')}
* [Always]
    -> END
`
    expect(play(source).errors).toEqual([])
  })
})


/**
 * The menu can now read its own `~` lines back into dropdowns, which is only
 * safe while the reader and the writers agree. Changing one without the other
 * fails here rather than quietly halving the feature.
 */
describe('parseEffect', () => {
  it('reads back everything the renderers write', () => {
    const written = [
      statEffect('strength', 'add', '1'),
      statEffect('strength', 'subtract', '2'),
      statEffect('strength', 'set', '5'),
      statEffect('title', 'set', '"archivist"'),
      flagEffect('has_met_wren', true),
      flagEffect('has_met_wren', false),
      itemEffect('inventory', 'brass_key', true),
      itemEffect('inventory', 'shovel', false)
    ]

    for (const logic of written) {
      const parsed = parseEffect(logic)
      expect(parsed, `could not read back: ${logic}`).not.toBeNull()
      expect(renderEffect(parsed!), logic).toBe(logic)
    }
  })

  it('reads an add, a subtract and a set apart', () => {
    expect(parseEffect('strength = strength + 1')).toMatchObject({ change: 'add', value: '1' })
    expect(parseEffect('strength = strength - 2')).toMatchObject({ change: 'subtract', value: '2' })
    expect(parseEffect('strength = 5')).toMatchObject({ change: 'set', value: '5' })
  })

  it('reads a flag as a flag rather than a set', () => {
    expect(parseEffect('seen = true')).toMatchObject({ kind: 'flag', value: true })
    expect(parseEffect('seen = false')).toMatchObject({ kind: 'flag', value: false })
  })

  it('reads giving and taking an item', () => {
    expect(parseEffect('inventory += shovel')).toMatchObject({
      kind: 'item',
      item: 'shovel',
      give: true
    })
    expect(parseEffect('pack -= rope')).toMatchObject({
      kind: 'item',
      variable: 'pack',
      item: 'rope',
      give: false
    })
  })

  it('tolerates the tilde and the spacing an author leaves', () => {
    expect(parseEffect('~   strength=strength+1')).toMatchObject({ change: 'add', value: '1' })
  })

  /**
   * The backreference is the whole point: `strength = strength + 1` adds one to
   * strength, `strength = nerve + 1` is an expression that happens to start the
   * same way, and turning the second into dropdowns would rewrite it wrongly.
   */
  it('does not read an expression as an increment of the wrong stat', () => {
    expect(parseEffect('strength = nerve + 1')).toBeNull()
  })

  it('leaves alone anything it did not write', () => {
    const untouchable = [
      'trust = trust + roll(6)',
      'strength = strength + nerve * 2',
      'archivist("You are late.")',
      'return true',
      'temp x = 3',
      'inventory += shovel, rope',
      'not a statement at all'
    ]

    for (const logic of untouchable) {
      expect(parseEffect(logic), logic).toBeNull()
    }
  })

  it('accepts a plain identifier as a value, since a stat may be set from one', () => {
    expect(parseEffect('title = archivist')).toMatchObject({ change: 'set', value: 'archivist' })
  })
})
