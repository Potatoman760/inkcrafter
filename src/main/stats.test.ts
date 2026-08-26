import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addItem,
  addStat,
  emptyStats,
  newItem,
  newStat,
  parseStats,
  updateItem
} from '@shared/statsDoc'
import type { Project } from '@shared/project'
import { compileStory } from './ink/compiler'
import type { CatalogueExport } from '@shared/statsExport'
import { readStats, writeStats } from './stats'

/**
 * Saving the catalogue is not just a file write — it regenerates the ink and
 * points the entry point at it. So this runs the real thing against a real
 * project and then compiles what came out, because "the declarations exist" and
 * "the story can use them" are different claims.
 */

let root = ''
let project: Project

const ENTRY = `// The story.

INCLUDE characters.ink

-> the_door

=== the_door ===
The door is shut.

* [Try the handle]
    -> END
`

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-stats-'))
  await mkdir(join(root, 'ink'), { recursive: true })
  await writeFile(join(root, 'ink', 'main.ink'), ENTRY, 'utf8')
  await writeFile(join(root, 'ink', 'characters.ink'), 'VAR archivist_trust = 0\n', 'utf8')

  project = {
    id: 'prj_0000000000',
    title: 'The Archive',
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

function catalogue(): ReturnType<typeof emptyStats> {
  let doc = emptyStats()
  doc = addStat(doc, { ...newStat('Strength'), initial: 2 })
  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addItem(doc, newItem('Shovel', 'Tools'))
  doc = addItem(doc, newItem('Brass key', 'Keys'))
  doc = updateItem(doc, doc.items[1]!.id, {
    display: 'Brass Key',
    blurb: 'Cold, heavy, older than the door.',
    icon: 'icons/key.png',
    custom: [{ label: 'slot', value: 'offhand' }]
  })
  return doc
}

/** Compiles the project through its entry point, the way the editor does. */
function compile(): ReturnType<typeof compileStory> {
  return compileStory({ filePath: join(root, 'ink', 'main.ink') })
}

describe('readStats', () => {
  it('is empty for a project that has no catalogue', async () => {
    expect(await readStats(project)).toEqual(emptyStats())
  })

  it('reads back what was written', async () => {
    const doc = catalogue()
    await writeStats(project, doc)

    expect(await readStats(project)).toEqual(doc)
  })
})

describe('writeStats', () => {
  it('writes the catalogue and generates the declarations', async () => {
    const { written } = await writeStats(project, catalogue())

    expect(written).toContain('stats.json')
    expect(written).toContain('ink/state.ink')

    const state = await readFile(join(root, 'ink', 'state.ink'), 'utf8')
    expect(state).toContain('VAR strength = 2')
    expect(state).toContain('LIST Tools = shovel')
    expect(state).toContain('VAR inventory = ()')
  })

  it('points the entry point at them', async () => {
    const { written } = await writeStats(project, catalogue())

    expect(written).toContain('ink/main.ink')
    expect(await readFile(join(root, 'ink', 'main.ink'), 'utf8')).toContain('INCLUDE state.ink')
  })

  it('leaves the entry point alone the second time', async () => {
    await writeStats(project, catalogue())
    const after = await readFile(join(root, 'ink', 'main.ink'), 'utf8')

    const { written } = await writeStats(project, catalogue())

    expect(written).not.toContain('ink/main.ink')
    expect(await readFile(join(root, 'ink', 'main.ink'), 'utf8')).toBe(after)
  })

  it('keeps the rest of the entry point exactly as it was', async () => {
    await writeStats(project, catalogue())
    const after = await readFile(join(root, 'ink', 'main.ink'), 'utf8')

    // Only the one line is new; the author's file is not reformatted.
    expect(after.replace('INCLUDE state.ink\n', '')).toBe(ENTRY)
  })

  // The point of the whole stage: a catalogue the story can actually use.
  it('leaves a story that compiles still compiling, with the vocabulary available', async () => {
    await writeStats(project, catalogue())

    const before = compile()
    expect(before.diagnostics.filter((d) => d.severity === 'error')).toEqual([])

    // Now use the vocabulary the catalogue just declared.
    await writeFile(
      join(root, 'ink', 'main.ink'),
      (await readFile(join(root, 'ink', 'main.ink'), 'utf8')).replace(
        '* [Try the handle]',
        '~ inventory += shovel\n* {inventory ? shovel} [Dig]\n    -> END\n* {strength >= 5} [Lift]\n    -> END\n* [Try the handle]'
      ),
      'utf8'
    )

    const after = compile()
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([])

    const story = after.story!
    while (story.canContinue) story.Continue()

    // The shovel gate opens, the strength gate does not: strength starts at 2.
    expect(story.currentChoices.map((choice) => choice.text)).toEqual(['Dig', 'Try the handle'])
  })

  it('survives an entry point that does not exist yet', async () => {
    const { written } = await writeStats({ ...project, main: 'ink/missing.ink' }, catalogue())

    // Everything generated still lands; only the INCLUDE has nowhere to go.
    expect(written).toEqual(['stats.json', 'ink/state.ink', 'export/catalogue.json'])
  })

  it('regenerates rather than appending, so a removed stat leaves no declaration', async () => {
    await writeStats(project, catalogue())
    await writeStats(project, emptyStats())

    const state = await readFile(join(root, 'ink', 'state.ink'), 'utf8')
    expect(state).not.toContain('strength')
    expect(state).not.toContain('LIST')
    expect(compile().diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('writes the export beside the ink', async () => {
    const { written } = await writeStats(project, catalogue())
    expect(written).toContain('export/catalogue.json')

    const exported = JSON.parse(
      await readFile(join(root, 'export', 'catalogue.json'), 'utf8')
    ) as CatalogueExport

    expect(exported.generatedBy).toBe('InkCrafter')
    expect(exported.inventoryVariable).toBe('inventory')
    expect(exported.stats.map((stat) => stat.name)).toEqual(['strength', 'has_met_wren'])
  })

  it('carries the metadata the ink has no way to hold', async () => {
    await writeStats(project, catalogue())
    const exported = JSON.parse(
      await readFile(join(root, 'export', 'catalogue.json'), 'utf8')
    ) as CatalogueExport

    const key = exported.items.find((item) => item.name === 'brass_key')!
    expect(key.display).toBe('Brass Key')
    expect(key.icon).toBe('icons/key.png')
    expect(key.custom).toEqual({ slot: 'offhand' })

    // And none of it leaked into the declarations, which only need names.
    const state = await readFile(join(root, 'ink', 'state.ink'), 'utf8')
    expect(state).not.toContain('Brass Key')
    expect(state).not.toContain('icons/key.png')
  })

  /**
   * The export's whole claim: an engine reads listDefs out of the compiled story
   * and the metadata out of catalogue.json, and joins them. Tested against the
   * real compile rather than asserted.
   */
  it('produces an export that joins to the compiled story', async () => {
    await writeStats(project, catalogue())

    const result = compile()
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])

    const listDefs = (JSON.parse(result.story!.ToJson()!) as {
      listDefs?: Record<string, Record<string, number>>
    }).listDefs!
    const exported = JSON.parse(
      await readFile(join(root, 'export', 'catalogue.json'), 'utf8')
    ) as CatalogueExport

    for (const item of exported.items) {
      expect(Object.keys(listDefs), `${item.list} missing`).toContain(item.list)
      expect(Object.keys(listDefs[item.list]!)).toContain(item.name)
    }
  })

  it('writes a catalogue that parses back identically', async () => {
    const doc = catalogue()
    await writeStats(project, doc)

    expect(parseStats(await readFile(join(root, 'stats.json'), 'utf8'))).toEqual(doc)
  })
})
