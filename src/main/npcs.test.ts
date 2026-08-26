import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addStat, emptyStats, newStat } from '@shared/statsDoc'
import { emptyNpcs, npcVar, type NpcDocument } from '@shared/bundle/npcDoc'
import type { Project } from '@shared/project'
import { compileStory } from './ink/compiler'
import { readNpcs, writeNpcs } from './npcs'
import { writeStats } from './stats'

/**
 * The cast becomes ink, so this compiles what came out. "The declarations
 * exist" and "the story can branch on them" are different claims, and only the
 * second is worth anything.
 *
 * The case that matters most is the one that used to be structurally possible:
 * two generators writing the same `VAR`. Stats and NPCs now share one file, and
 * the test that proves it is a compile.
 */

let root = ''
let project: Project

const ENTRY = `INCLUDE state.ink

-> start

=== start ===
{ abeline_affection >= 2: She softens. | She says nothing. }
{ abeline_status == "married": You are married. }
{ abeline_isPregnant: She rests a hand on her belly. }
-> END
`

const CAST: NpcDocument = {
  version: 1,
  npcs: [
    {
      id: 'npc_0000000001',
      inkId: 'abeline',
      name: 'Sister Abeline',
      sprite: 'abeline',
      stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 }],
      statuses: [
        {
          key: 'status',
          label: 'Status',
          initial: 'single',
          values: ['single', 'married', 'widowed']
        }
      ],
      flags: [{ key: 'isPregnant', label: 'Pregnant', initial: false }]
    }
  ]
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-npcs-'))
  await mkdir(join(root, 'ink'), { recursive: true })
  await writeFile(join(root, 'ink', 'main.ink'), ENTRY, 'utf8')

  project = {
    id: 'prj_0000000000',
    title: 'The Convent',
    libraries: [],
    main: 'ink/main.ink',
    description: '',
    bundleOut: null,
    path: root
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const stateInk = (): Promise<string> => readFile(join(root, 'ink', 'state.ink'), 'utf8')

describe('writeNpcs', () => {
  it('declares one variable per attribute, and the story compiles against them', async () => {
    await writeNpcs(project, CAST)

    const generated = await stateInk()
    expect(generated).toContain('VAR abeline_affection = 0')
    expect(generated).toContain('VAR abeline_status = "single"')
    expect(generated).toContain('VAR abeline_isPregnant = false')

    const { story, diagnostics } = compileStory({ filePath: join(root, 'ink', 'main.ink') })
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(story).not.toBeNull()
  })

  it('keeps the stats when the cast is saved, and the cast when the stats are', async () => {
    await writeStats(project, addStat(emptyStats(), newStat('courage')))
    await writeNpcs(project, CAST)

    let generated = await stateInk()
    expect(generated).toContain('VAR courage =')
    expect(generated).toContain('VAR abeline_affection =')

    // Saving the other half must not drop the first — one generated file means
    // every write rewrites the whole thing.
    await writeStats(project, addStat(emptyStats(), newStat('faith')))

    generated = await stateInk()
    expect(generated).toContain('VAR faith =')
    expect(generated).toContain('VAR abeline_affection =')
  })

  // The hazard the single generated file exists to remove: two things declaring
  // the same name is a compile error, not a warning.
  it('declares each name exactly once', async () => {
    await writeStats(project, addStat(emptyStats(), newStat('courage')))
    await writeNpcs(project, CAST)

    const declared = [...(await stateInk()).matchAll(/^VAR\s+(\w+)/gm)].map((match) => match[1])

    expect(new Set(declared).size).toBe(declared.length)
    expect(declared).toContain(npcVar('abeline', 'affection'))
  })

  it('round-trips through the file', async () => {
    await writeNpcs(project, CAST)

    expect(await readNpcs(project)).toEqual(CAST)
  })

  it('is an empty cast when the project has none', async () => {
    expect(await readNpcs(project)).toEqual(emptyNpcs())
  })

  it('cannot be broken by a quote in a status', async () => {
    await writeNpcs(project, {
      version: 1,
      npcs: [
        {
          ...CAST.npcs[0]!,
          statuses: [
            { key: 'status', label: 'Status', initial: 'sa"id', values: ['sa"id'] }
          ]
        }
      ]
    })

    // Ink has no escape for a quote inside a string, so it is dropped rather
    // than allowed to end the literal early and break everything after it.
    expect(await stateInk()).toContain('VAR abeline_status = "said"')

    const { diagnostics } = compileStory({ filePath: join(root, 'ink', 'main.ink') })
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })
})
