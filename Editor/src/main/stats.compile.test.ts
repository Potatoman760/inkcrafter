import { describe, expect, it } from 'vitest'
import { Compiler, CompilerOptions } from 'inkjs/compiler/Compiler'
import {
  addItem,
  addStat,
  emptyStats,
  newItem,
  newStat,
  type StatsDocument
} from '@shared/statsDoc'
import { includePathFrom, renderStateInk, withStateInclude } from '@shared/statsInk'

/**
 * The generated declarations have to compile, and the vocabulary has to actually
 * gate a choice. Both are claims about ink, and a claim about ink is worth
 * nothing until the compiler has been asked.
 */

interface Run {
  errors: string[]
  output: string
  choices: string[]
}

function play(source: string, pick?: number): Run {
  const errors: string[] = []
  const options = new CompilerOptions(null, [], false, (message: string, type: number) => {
    if (type !== 0) errors.push(message.trim())
  })

  const story = new Compiler(source, options).Compile()
  let output = ''
  while (story.canContinue) output += story.Continue()
  const choices = story.currentChoices.map((choice) => choice.text ?? '')

  if (pick !== undefined && choices.length > pick) {
    story.ChooseChoiceIndex(pick)
    while (story.canContinue) output += story.Continue()
  }

  return { errors, output, choices }
}

function seeded(): StatsDocument {
  let doc = emptyStats()
  doc = addStat(doc, { ...newStat('Strength'), initial: 2 })
  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addStat(doc, { ...newStat('Title', 'text'), initial: 'archivist' })
  doc = addItem(doc, newItem('Shovel'))
  doc = addItem(doc, newItem('Rope'))
  doc = addItem(doc, newItem('Brass key'))
  return doc
}

describe('renderStateInk', () => {
  it('compiles, and declares every stat at its initial value', () => {
    const source = `${renderStateInk(seeded())}
-> start

=== start ===
Strength {strength}. Wren {has_met_wren}. Title {title}.
-> END
`
    const { errors, output } = play(source)

    expect(errors).toEqual([])
    expect(output).toBe('Strength 2. Wren false. Title archivist.\n')
  })

  it('gates a choice on an item the player does not have, then on one they do', () => {
    // The whole point of the catalogue, end to end.
    const source = `${renderStateInk(seeded())}
-> start

=== start ===
You stand at the hole.
* {inventory ? shovel} [Dig]
    -> done
* {inventory ? brass_key} [Unlock]
    -> done
* [Wait]
    -> done

=== done ===
-> END
`
    expect(play(source).choices).toEqual(['Wait'])

    const carrying = source.replace('You stand at the hole.', 'You stand at the hole.\n~ inventory += shovel')
    expect(play(carrying).choices).toEqual(['Dig', 'Wait'])
  })

  it('gates a choice on a stat', () => {
    const source = `${renderStateInk(seeded())}
-> start

=== start ===
* {strength >= 3} [Lift the beam]
    -> done
* [Leave it]
    -> done

=== done ===
-> END
`
    expect(play(source).choices).toEqual(['Leave it'])
    expect(play(source.replace('~', '~')).choices).toEqual(['Leave it'])

    const stronger = renderStateInk({
      ...seeded(),
      stats: seeded().stats.map((stat) => (stat.name === 'strength' ? { ...stat, initial: 4 } : stat))
    })
    expect(play(source.replace(renderStateInk(seeded()), stronger)).choices).toEqual([
      'Lift the beam',
      'Leave it'
    ])
  })

  // A hundred names in one LIST is the scale the catalogue is meant for, so it
  // is tested rather than assumed.
  it('compiles a hundred items in one list', () => {
    let doc = emptyStats()
    for (let n = 0; n < 100; n++) doc = addItem(doc, newItem(`item ${n}`))

    const source = `${renderStateInk(doc)}
-> start

=== start ===
~ inventory += item_0
Carrying {LIST_COUNT(inventory)}.
* {inventory ? item_0} [Dig]
    -> done

=== done ===
-> END
`
    const { errors, output, choices } = play(source)

    expect(errors).toEqual([])
    expect(doc.items).toHaveLength(100)
    expect(output).toBe('Carrying 1.\n')
    expect(choices).toEqual(['Dig'])
  })

  it('declares no inventory when there are no items', () => {
    const stats = addStat(emptyStats(), newStat('Strength'))
    const rendered = renderStateInk(stats)

    expect(rendered).toContain('VAR strength = 0')
    expect(rendered).not.toContain('VAR inventory')
  })

  it('declares every item in one list', () => {
    let doc = addItem(emptyStats(), newItem('Shovel'))
    doc = addItem(doc, newItem('Brass key'))
    const rendered = renderStateInk(doc)

    expect(rendered).toContain('LIST items = shovel, brass_key')
    expect(play(`${rendered}\n-> START\n=== START ===\n-> END\n`).errors).toEqual([])
  })

  it('compiles when the catalogue is empty', () => {
    expect(play(`${renderStateInk(emptyStats())}\n-> start\n=== start ===\nx\n-> END\n`).errors).toEqual([])
  })

  it('writes a text stat that contains a quote without breaking the declaration', () => {
    const doc = addStat(emptyStats(), { ...newStat('Title', 'text'), initial: 'the "keeper"' })
    expect(play(`${renderStateInk(doc)}\n-> s\n=== s ===\n{title}\n-> END\n`).errors).toEqual([])
  })

  it('carries a description through as a comment', () => {
    const doc = addStat(emptyStats(), { ...newStat('Strength'), description: 'How much they can lift.' })
    expect(renderStateInk(doc)).toContain('// How much they can lift.')
  })
})

describe('withStateInclude', () => {
  it('adds the include to an entry point that lacks it', () => {
    const before = '// The story.\n\n-> start\n\n=== start ===\nx\n-> END\n'
    const after = withStateInclude(before, 'ink/main.ink')

    expect(after).toContain('INCLUDE state.ink')
    // Above the divert: a file that opens with `-> start` never reads what
    // follows it, so declarations placed after would not exist.
    expect(after.indexOf('INCLUDE state.ink')).toBeLessThan(after.indexOf('-> start'))
  })

  it('puts it with the other includes when there are some', () => {
    const before = '// The story.\n\nINCLUDE characters.ink\n\n-> start\n'
    const after = withStateInclude(before, 'ink/main.ink')

    expect(after.split('\n').filter((line) => line.startsWith('INCLUDE'))).toEqual([
      'INCLUDE state.ink',
      'INCLUDE characters.ink'
    ])
  })

  it('changes nothing when the include is already there', () => {
    const before = 'INCLUDE state.ink\n\n-> start\n'
    expect(withStateInclude(before, 'ink/main.ink')).toBe(before)
  })

  it('leaves a story that compiles still compiling', () => {
    const before = '// A story.\n\n-> start\n\n=== start ===\nx\n-> END\n'
    const after = withStateInclude(before, 'ink/main.ink')

    // Compiled with state.ink inlined, since the test has no file handler.
    const inlined = after.replace('INCLUDE state.ink', renderStateInk(seeded()))
    expect(play(inlined).errors).toEqual([])
  })
})

describe('includePathFrom', () => {
  it('is a bare filename for an entry point beside it', () => {
    expect(includePathFrom('ink/main.ink')).toBe('state.ink')
  })

  it('climbs out of a subfolder', () => {
    expect(includePathFrom('ink/chapters/main.ink')).toBe('../state.ink')
  })

  it('descends from an entry point at the project root', () => {
    expect(includePathFrom('main.ink')).toBe('ink/state.ink')
  })
})
