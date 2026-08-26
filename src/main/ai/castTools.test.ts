import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Compiler } from 'inkjs/compiler/Compiler'
import { parseNpcs } from '@shared/bundle/npcDoc'
import type { ToolContext } from './workspaceTools'

/**
 * The failure this tool exists to prevent: a cast written straight to
 * `npcs.json` shows up in the app and declares nothing, so every condition on
 * it fails to compile with no clue as to why.
 *
 * So the assertions here are mostly about `ink/state.ink` rather than about the
 * catalogue — the catalogue was never the hard part.
 */

let root = ''

vi.mock('../workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

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
let projectPath = ''

const cast = async (args: unknown): Promise<{ ok: boolean; content: string; summary: string }> =>
  runTool('write_cast', JSON.stringify(args), context, ALL_TOOLS)

const stateInk = async (): Promise<string> =>
  readFile(join(projectPath, 'ink', 'state.ink'), 'utf8')

const catalogue = async (): Promise<ReturnType<typeof parseNpcs>> =>
  parseNpcs(await readFile(join(projectPath, 'npcs.json'), 'utf8'))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-cast-'))
  projectPath = join(root, 'projects', 'the-lighthouse')
  await mkdir(join(projectPath, 'ink'), { recursive: true })
  await writeFile(join(projectPath, 'ink', 'main.ink'), ENTRY, 'utf8')
  await writeFile(
    join(projectPath, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: The Lighthouse\nlibraries: []\nmain: ink/main.ink\n---\n\nA light.\n',
    'utf8'
  )

  const project = (await readProject(projectPath))!
  context = { root, written: [], project }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('write_cast', () => {
  it('declares every attribute as an ink variable, which is the whole point', async () => {
    const result = await cast({
      cast: [
        {
          name: 'Maren',
          stats: [{ key: 'trust', label: 'Trust', initial: 2, min: 0, max: 10 }],
          statuses: [{ key: 'standing', values: ['stranger', 'ally'], initial: 'stranger' }],
          flags: [{ key: 'knows', initial: false }]
        }
      ]
    })

    expect(result.ok).toBe(true)

    const state = await stateInk()
    expect(state).toContain('VAR maren_trust = 2')
    expect(state).toContain('VAR maren_standing = "stranger"')
    expect(state).toContain('VAR maren_knows = false')
  })

  it('produces declarations a story can actually gate on', async () => {
    await cast({
      cast: [
        {
          name: 'Maren',
          stats: [{ key: 'trust', initial: 2, min: 0, max: 10 }],
          flags: [{ key: 'knows', initial: false }]
        }
      ]
    })

    // Inlined rather than INCLUDEd: the compiler needs a FileHandler to resolve
    // an include, and what is under test is the declarations, not ink's loader.
    const source = `${await stateInk()}
-> the_door
=== the_door ===
* {maren_trust >= 2} [Come in]
    -> END
* {maren_knows} [You already knew]
    -> END
`
    const story = new Compiler(source).Compile()
    while (story.canContinue) story.Continue()

    // Trust is at 2 of 10 so that gate opens; the flag is false so its does not.
    expect(story.currentChoices.map((choice) => choice.text)).toEqual(['Come in'])
  })

  it('writes the catalogue the Cast tab reads', async () => {
    await cast({ cast: [{ name: 'Maren', flags: [{ key: 'knows' }] }] })

    const doc = await catalogue()
    expect(doc.npcs).toHaveLength(1)
    expect(doc.npcs[0]?.inkId).toBe('maren')
    expect(doc.npcs[0]?.name).toBe('Maren')
  })

  it('reports both files, so the open Cast tab reloads', async () => {
    await cast({ cast: [{ name: 'Maren', flags: [{ key: 'knows' }] }] })

    expect(context.written).toContain('projects/the-lighthouse/npcs.json')
    expect(context.written).toContain('projects/the-lighthouse/ink/state.ink')
  })

  it('derives the ink id from the name, and takes one given outright', async () => {
    await cast({
      cast: [
        { name: 'Seraphine V', flags: [{ key: 'crowned' }] },
        { name: 'The Warden', ink_id: 'warden', flags: [{ key: 'awake' }] }
      ]
    })

    const doc = await catalogue()
    expect(doc.npcs.map((npc) => npc.inkId)).toEqual(['seraphine_v', 'warden'])
  })

  it('merges rather than replaces: a second call keeps the first call’s attributes', async () => {
    await cast({ cast: [{ name: 'Maren', stats: [{ key: 'trust', initial: 2 }] }] })
    await cast({ cast: [{ name: 'Maren', flags: [{ key: 'knows' }] }] })

    const doc = await catalogue()
    expect(doc.npcs).toHaveLength(1)
    expect(doc.npcs[0]?.stats.map((one) => one.key)).toEqual(['trust'])
    expect(doc.npcs[0]?.flags.map((one) => one.key)).toEqual(['knows'])
  })

  it('updates an attribute in place when the key comes back', async () => {
    await cast({ cast: [{ name: 'Maren', stats: [{ key: 'trust', initial: 2, max: 10 }] }] })
    await cast({ cast: [{ name: 'Maren', stats: [{ key: 'trust', initial: 5, max: 20 }] }] })

    const doc = await catalogue()
    expect(doc.npcs[0]?.stats).toHaveLength(1)
    expect(doc.npcs[0]?.stats[0]).toMatchObject({ initial: 5, max: 20 })
  })

  it('keeps the sprite when a later call does not mention it', async () => {
    await cast({ cast: [{ name: 'Maren', sprite: 'maren', flags: [{ key: 'knows' }] }] })
    await cast({ cast: [{ name: 'Maren', flags: [{ key: 'left' }] }] })

    expect((await catalogue()).npcs[0]?.sprite).toBe('maren')
  })

  it('clamps a starting value that sits outside its own range', async () => {
    await cast({ cast: [{ name: 'Maren', stats: [{ key: 'trust', initial: 99, min: 0, max: 10 }] }] })

    expect((await catalogue()).npcs[0]?.stats[0]?.initial).toBe(10)
  })

  it('drops a status with no permitted words rather than writing one that cannot be set', async () => {
    await cast({
      cast: [{ name: 'Maren', statuses: [{ key: 'mood', values: [] }], flags: [{ key: 'knows' }] }]
    })

    const doc = await catalogue()
    expect(doc.npcs[0]?.statuses).toEqual([])
    expect(doc.npcs[0]?.flags).toHaveLength(1)
  })

  it('falls back to the first permitted word when the initial is not one of them', async () => {
    await cast({
      cast: [{ name: 'Maren', statuses: [{ key: 'mood', values: ['wary', 'warm'], initial: 'furious' }] }]
    })

    expect((await catalogue()).npcs[0]?.statuses[0]?.initial).toBe('wary')
  })

  it('says so rather than writing nothing when there is nothing usable', async () => {
    const result = await cast({ cast: [{ name: '' }] })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/needs a name/)
  })

  it('warns when a cast variable collides with a stat', async () => {
    await runTool(
      'write_variables',
      JSON.stringify({ stats: [{ name: 'maren_trust', kind: 'number' }] }),
      context,
      ALL_TOOLS
    )
    const result = await cast({ cast: [{ name: 'Maren', stats: [{ key: 'trust' }] }] })

    expect(result.content).toMatch(/maren_trust/)
    expect(result.content).toMatch(/collide/)
  })
})

describe('write_file and the cast', () => {
  it('refuses npcs.json and names the tool that declares it', async () => {
    const result = await runTool(
      'write_file',
      JSON.stringify({
        path: 'projects/the-lighthouse/npcs.json',
        contents: '{"version":1,"npcs":[]}'
      }),
      context,
      ALL_TOOLS
    )

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/write_cast/)
  })
})
