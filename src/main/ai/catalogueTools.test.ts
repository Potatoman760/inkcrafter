import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Compiler } from 'inkjs/compiler/Compiler'
import { isIdOf } from '@shared/ids'
import { parseStats } from '@shared/statsDoc'
import type { ToolContext } from './workspaceTools'

let root = ''

vi.mock('../workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

const { listLibraries, loadEntries } = await import('../codex/library')
const { readProject } = await import('../project')
const { runTool } = await import('./workspaceTools')
const { ALL_TOOLS } = await import('./tools')

const ENTRY = `// The story.

-> the_door

=== the_door ===
The door is shut.

* [Try the handle]
    -> END
`

let context: ToolContext

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-catalogue-'))
  const path = join(root, 'projects', 'the-lighthouse')
  await mkdir(join(path, 'ink'), { recursive: true })
  await writeFile(join(path, 'ink', 'main.ink'), ENTRY, 'utf8')
  await writeFile(
    join(path, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: The Lighthouse\nlibraries: []\nmain: ink/main.ink\n---\n\nA light.\n',
    'utf8'
  )

  const project = (await readProject(path))!
  context = { root, written: [], project }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const call = (name: string, args: unknown): ReturnType<typeof runTool> =>
  runTool(name, JSON.stringify(args), context, ALL_TOOLS)

const projectPath = (): string => join(root, 'projects', 'the-lighthouse')
const read = (relative: string): Promise<string> =>
  readFile(join(projectPath(), relative), 'utf8')

describe('write_variables', () => {
  it('teaches the model that possession is an item, not a has_* stat', () => {
    const schema = JSON.stringify(ALL_TOOLS.find((tool) => tool.name === 'write_variables'))

    expect(schema).toContain('never a has_ring stat or var')
    expect(schema).toContain('possession of a ring is the ring item')
    expect(schema).toContain('{inventory ? item_name}')
    expect(schema).toContain('deliberately shown to the player')
  })

  /**
   * The reason this tool exists. Writing stats.json is not enough — the VAR and
   * LIST lines live in a generated file, and a catalogue that declares nothing
   * fails only later, when a condition will not compile.
   */
  it('regenerates the declarations, which a file write would not', async () => {
    const result = await call('write_variables', {
      stats: [{ name: 'strength', kind: 'number', initial: 2, display: 'Strength' }],
      items: [{ name: 'brass_key', category: 'Keys', display: 'Brass Key' }]
    })

    expect(result.ok).toBe(true)

    const state = await read('ink/state.ink')
    expect(state).toContain('VAR strength = 2')
    expect(state).toContain('LIST Keys = brass_key')
    expect(state).toContain('VAR inventory = ()')

    // And the entry point can see it.
    expect(await read('ink/main.ink')).toContain('INCLUDE state.ink')
  })

  it('leaves a story that compiles able to use what it declared', async () => {
    await call('write_variables', {
      stats: [{ name: 'strength', kind: 'number', initial: 2 }],
      items: [{ name: 'brass_key', category: 'Keys' }]
    })

    const source = (await read('ink/state.ink')) + `
-> s
=== s ===
~ inventory += brass_key
* {inventory ? brass_key} [Unlock]
    -> END
* {strength >= 5} [Lift]
    -> END
`
    const story = new Compiler(source).Compile()
    while (story.canContinue) story.Continue()

    // The key gate opens; the strength gate does not, at 2 of 5.
    expect(story.currentChoices.map((choice) => choice.text)).toEqual(['Unlock'])
  })

  it('exports the catalogue alongside, for a game engine', async () => {
    await call('write_variables', { stats: [{ name: 'strength', display: 'Strength' }] })

    const exported = JSON.parse(await read('export/catalogue.json')) as {
      stats: { name: string; display: string }[]
    }
    expect(exported.stats[0]).toMatchObject({ name: 'strength', display: 'Strength' })
  })

  it('keeps hidden vars separate from player-visible stats', async () => {
    await call('write_variables', {
      stats: [{ name: 'strength', display: 'Strength' }],
      variables: [{ name: 'has_met_keeper', kind: 'boolean', initial: false }]
    })

    const doc = parseStats(await read('stats.json'))
    expect(doc.stats.map((stat) => stat.name)).toEqual(['strength'])
    expect(doc.variables.map((variable) => variable.name)).toEqual(['has_met_keeper'])

    const exported = JSON.parse(await read('export/catalogue.json')) as {
      stats: { name: string }[]
      variables: { name: string }[]
    }
    expect(exported.stats.map((stat) => stat.name)).toEqual(['strength'])
    expect(exported.variables.map((variable) => variable.name)).toEqual(['has_met_keeper'])
  })

  // No undo in this workspace: a model that omits a field must not thereby
  // delete a stat someone spent time on.
  it('merges rather than replacing', async () => {
    await call('write_variables', { stats: [{ name: 'strength', initial: 2 }] })
    await call('write_variables', { stats: [{ name: 'nerve', initial: 5 }] })

    const doc = parseStats(await read('stats.json'))
    expect(doc.stats.map((stat) => stat.name)).toEqual(['strength', 'nerve'])
  })

  it('updates a stat that is already there, keeping its id', async () => {
    await call('write_variables', { stats: [{ name: 'strength', initial: 2 }] })
    const before = parseStats(await read('stats.json')).stats[0]!

    await call('write_variables', { stats: [{ name: 'strength', initial: 9, display: 'Might' }] })
    const after = parseStats(await read('stats.json')).stats[0]!

    expect(after).toMatchObject({ id: before.id, name: 'strength', initial: 9, display: 'Might' })
  })

  it('cleans a name written as prose into an ink identifier', async () => {
    await call('write_variables', { items: [{ name: 'Brass Key', category: 'Keys' }] })

    const doc = parseStats(await read('stats.json'))
    expect(doc.items[0]).toMatchObject({ name: 'brass_key', display: 'Brass Key' })
  })

  it('records the category so the LIST is generated', async () => {
    await call('write_variables', { items: [{ name: 'shovel', category: 'Tools' }] })
    expect(parseStats(await read('stats.json')).categories).toEqual(['Tools'])
  })

  it('drops an item with no category rather than guessing one', async () => {
    const result = await call('write_variables', { items: [{ name: 'orphan' }] })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/also needs a category/)
  })

  it('says so when there is nothing usable, rather than writing an empty catalogue', async () => {
    const result = await call('write_variables', { variables: [{ name: '???' }] })
    expect(result.ok).toBe(false)
  })

  it('reports what it wrote, so the app reloads it', async () => {
    await call('write_variables', { variables: [{ name: 'strength' }] })

    expect(context.written).toContain('projects/the-lighthouse/stats.json')
    expect(context.written).toContain('projects/the-lighthouse/ink/state.ink')
  })

  it('refuses without a project rather than guessing which one', async () => {
    context = { ...context, project: null }
    const result = await call('write_variables', { variables: [{ name: 'strength' }] })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/No project is open/)
  })
})

describe('write_codex_entry', () => {
  /**
   * The reason this one exists: an entry in a library the project does not link
   * is never loaded, so the entry, the library and the link are one operation.
   */
  it('creates the library and links it to the project', async () => {
    const result = await call('write_codex_entry', {
      name: 'Wren Calloway',
      type: 'character',
      description: 'Keeper of the light for eleven years.',
      aliases: ['Wren']
    })

    expect(result.ok).toBe(true)

    const libraries = await listLibraries(join(root, 'codex'))
    expect(libraries).toHaveLength(1)

    const project = (await readProject(projectPath()))!
    expect(project.libraries).toEqual([libraries[0]!.id])
  })

  it('writes an entry the app reads back whole', async () => {
    await call('write_codex_entry', {
      name: 'Wren Calloway',
      type: 'character',
      description: 'Keeper of the light.',
      appearance: 'Close-cropped black hair, a long red coat, and a brass lantern.',
      aliases: ['Wren', 'The keeper'],
      tags: ['cast']
    })

    const library = (await listLibraries(join(root, 'codex')))[0]!
    const entries = await loadEntries(library)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      name: 'Wren Calloway',
      type: 'character',
      aliases: ['Wren', 'The keeper'],
      tags: ['cast'],
      appearance: 'Close-cropped black hair, a long red coat, and a brass lantern.',
      description: 'Keeper of the light.'
    })
    expect(isIdOf(entries[0]!.id, 'cdx')).toBe(true)
  })

  it('puts a second entry in the same library rather than making another', async () => {
    await call('write_codex_entry', { name: 'Wren', description: 'One.' })
    await call('write_codex_entry', { name: 'Idris', description: 'Two.' })

    const libraries = await listLibraries(join(root, 'codex'))
    expect(libraries).toHaveLength(1)
    expect((await loadEntries(libraries[0]!)).map((entry) => entry.name).sort()).toEqual([
      'Idris',
      'Wren'
    ])
  })

  it('links the library exactly once across several entries', async () => {
    await call('write_codex_entry', { name: 'Wren', description: 'One.' })
    await call('write_codex_entry', { name: 'Idris', description: 'Two.' })

    const project = (await readProject(projectPath()))!
    expect(project.libraries).toHaveLength(1)
  })

  it('updates an entry of the same name rather than duplicating it', async () => {
    await call('write_codex_entry', { name: 'Wren', description: 'First.' })
    const library = (await listLibraries(join(root, 'codex')))[0]!
    const before = (await loadEntries(library))[0]!

    await call('write_codex_entry', { name: 'Wren', description: 'Second.' })
    const after = await loadEntries(library)

    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: before.id, description: 'Second.' })
  })

  it('writes into a named library, creating it', async () => {
    await call('write_codex_entry', {
      name: 'Mara',
      description: 'A keeper.',
      library: 'Lighthouse world'
    })

    const libraries = await listLibraries(join(root, 'codex'))
    expect(libraries.map((library) => library.title)).toEqual(['Lighthouse world'])
  })

  it('files an entry under a folder named for its type', async () => {
    await call('write_codex_entry', { name: 'The Cove', type: 'location', description: 'Rocks.' })

    const library = (await listLibraries(join(root, 'codex')))[0]!
    expect((await loadEntries(library))[0]!.file).toBe('locations/the-cove')
  })

  it('refuses an entry with no name', async () => {
    const result = await call('write_codex_entry', { name: '  ', description: 'x' })
    expect(result.ok).toBe(false)
  })
})

describe('the files these tools own', () => {
  // Written by hand they fail quietly, so the refusal names the tool instead.
  for (const path of [
    'projects/the-lighthouse/stats.json',
    'projects/the-lighthouse/ink/state.ink',
    'projects/the-lighthouse/export/catalogue.json'
  ]) {
    it(`refuses write_file on ${path}`, async () => {
      const result = await call('write_file', { path, contents: '{}' })

      expect(result.ok).toBe(false)
      expect(result.content).toMatch(/is generated\. Use write_variables/)
    })
  }

  it('still allows an ordinary ink file', async () => {
    const result = await call('write_file', {
      path: 'projects/the-lighthouse/ink/chapter.ink',
      contents: '=== a ===\nx\n-> END\n'
    })
    expect(result.ok).toBe(true)
  })
})
