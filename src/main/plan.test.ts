import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planFromMarkdown, serialisePlan } from '@shared/planDoc'
import type { Project } from '@shared/project'
import { compileInk } from './ink/compiler'
import { createPlanScene, readPlan, writePlan, writePlanWithResult } from './plan'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<Project> {
  const path = await mkdtemp(join(tmpdir(), 'inkcrafter-plan-'))
  roots.push(path)
  await mkdir(join(path, 'ink'), { recursive: true })
  await writeFile(join(path, 'ink', 'main.ink'), '-> start\n\n=== start ===\nReady.\n-> END\n')
  return {
    id: 'prj_0000000000',
    title: 'Probe',
    libraries: [],
    main: 'ink/main.ink',
    description: '',
    bundleOut: null,
    path
  }
}

describe('managed plan Scenes', () => {
  it('migrates a chapter file into its Chapter folder without rewriting the Ink', async () => {
    const current = await project()
    const oldInk = '=== arrival ===\nThe old scene stays byte-for-byte.\n-> END\n'
    await writeFile(join(current.path, 'ink', 'chapter1.ink'), oldInk)
    const legacy = planFromMarkdown('# Act\n\n## Chapter 1: Arrival\n\nThe chapter overview.\n')
    legacy.nodes[0]!.children[0]!.files = ['ink/chapter1.ink']
    await writeFile(join(current.path, 'plan.json'), serialisePlan(legacy))

    const migrated = await readPlan(current)
    const chapter = migrated.nodes[0]!.children[0]!

    expect(chapter.files).toEqual([])
    expect(chapter.folder).toBe('chapter-1-arrival')
    expect(chapter.children[0]!.files).toEqual(['chapter-1-arrival/chapter1.ink'])
    expect(chapter.children[0]!.knot).toBe('arrival')
    expect(await readFile(join(current.path, 'chapter-1-arrival', 'chapter1.ink'), 'utf8')).toBe(
      oldInk
    )
  })

  it('infers an existing Chapter folder from the Scenes already inside it', async () => {
    const current = await project()
    await mkdir(join(current.path, 'chapter1'), { recursive: true })
    await writeFile(join(current.path, 'chapter1', 'opening.ink'), '=== opening ===\n-> END\n')
    const plan = planFromMarkdown('# Act\n\n## Arrival\n\n### Opening\n')
    plan.nodes[0]!.children[0]!.children[0]!.files = ['chapter1/opening.ink']

    const stored = await writePlan(current, plan)

    expect(stored.nodes[0]!.children[0]!.folder).toBe('chapter1')
  })

  it('creates a Scene, its file, and the entry-point INCLUDE together', async () => {
    const current = await project()
    const plan = planFromMarkdown('# Act\n\n## Arrival\n')
    const chapter = plan.nodes[0]!.children[0]!

    const created = await createPlanScene(current, plan, chapter.id, 'At the gate')
    const scene = created.plan.nodes[0]!.children[0]!.children[0]!

    expect(created.plan.nodes[0]!.children[0]!.folder).toBe('arrival')
    expect(scene.files).toEqual(['arrival/at-the-gate.ink'])
    expect(await readFile(join(current.path, ...scene.files[0]!.split('/')), 'utf8')).toContain(
      '=== at_the_gate ==='
    )
    expect(await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')).toContain(
      'INCLUDE ../arrival/at-the-gate.ink'
    )
    expect(created.written).toEqual(
      expect.arrayContaining(['arrival/at-the-gate.ink', 'ink/main.ink', 'plan.json'])
    )
    expect(compileInk({ filePath: join(current.path, 'ink', 'main.ink') }).ok).toBe(true)
  })

  it('creates a Scene in the Chapter folder it points to', async () => {
    const current = await project()
    const plan = planFromMarkdown('# Act\n\n## Arrival\n')
    const chapter = plan.nodes[0]!.children[0]!
    chapter.folder = 'chapter1'

    const created = await createPlanScene(current, plan, chapter.id, 'At the gate')

    expect(created.plan.nodes[0]!.children[0]!.folder).toBe('chapter1')
    expect(created.file).toBe('chapter1/at-the-gate.ink')
    expect(await readFile(join(current.path, 'chapter1', 'at-the-gate.ink'), 'utf8')).toContain(
      '=== at_the_gate ==='
    )
  })

  it('moves existing Scene Ink when its Chapter folder changes', async () => {
    const current = await project()
    await mkdir(join(current.path, 'chapter1'), { recursive: true })
    const original = '=== opening ===\nThe authored scene stays intact.\n-> END\n'
    await writeFile(join(current.path, 'chapter1', 'opening.ink'), original)
    await writeFile(
      join(current.path, 'ink', 'main.ink'),
      'INCLUDE ../chapter1/opening.ink\n\n-> opening\n'
    )
    const plan = planFromMarkdown('# Act\n\n## Arrival\n\n### Opening\n')
    const chapter = plan.nodes[0]!.children[0]!
    chapter.folder = 'chapter2'
    chapter.children[0]!.files = ['chapter1/opening.ink']

    const stored = await writePlan(current, plan)

    expect(stored.nodes[0]!.children[0]!.children[0]!.files).toEqual([
      'chapter2/opening.ink'
    ])
    expect(await readFile(join(current.path, 'chapter2', 'opening.ink'), 'utf8')).toBe(original)
    await expect(readFile(join(current.path, 'chapter1', 'opening.ink'), 'utf8')).rejects.toThrow()
    expect(await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')).toContain(
      'INCLUDE ../chapter2/opening.ink'
    )
  })

  it('refuses to create two Scenes that would declare the same knot', async () => {
    const current = await project()
    const plan = planFromMarkdown('# Act\n\n## Arrival\n')
    const chapter = plan.nodes[0]!.children[0]!
    const first = await createPlanScene(current, plan, chapter.id, 'At the gate')

    await expect(createPlanScene(current, first.plan, chapter.id, 'At the gate')).rejects.toThrow(
      'already uses the Ink knot'
    )
  })

  it('restores a referenced Scene file that has gone missing', async () => {
    const current = await project()
    const plan = planFromMarkdown('# Act\n\n## Arrival\n\n### Return\n')
    plan.nodes[0]!.children[0]!.folder = 'chapter1'
    plan.nodes[0]!.children[0]!.children[0]!.files = ['chapter1/return.ink']

    const stored = await writePlan(current, plan)

    expect(stored.nodes[0]!.children[0]!.children[0]!.files).toEqual([
      'chapter1/return.ink'
    ])
    expect(await readFile(join(current.path, 'chapter1', 'return.ink'), 'utf8')).toContain(
      '=== return ==='
    )
  })

  it('refuses a Scene path that escapes the project', async () => {
    const current = await project()
    const plan = planFromMarkdown('# Act\n\n## Arrival\n\n### Return\n')
    plan.nodes[0]!.children[0]!.children[0]!.files = ['../outside.ink']

    await expect(writePlan(current, plan)).rejects.toThrow('escapes the project')
  })
})

/**
 * The entry point is the one file that says what the story is made of, so it
 * should say it in the order the story is read. A Scene added to chapter one
 * after chapter two was written belongs in chapter one's group, not on top of
 * the file, which is where every missing include used to land.
 */
describe('entry-point includes', () => {
  const SOURCE = [
    '# Act One',
    '',
    '## Arrival',
    '',
    '### At the gate',
    '',
    '### The hall',
    '',
    '## Departure',
    '',
    '### The road',
    ''
  ].join('\n')

  it('lists every Scene in reading order, whatever order they were made in', async () => {
    const current = await project()
    let plan = planFromMarkdown('# Act One\n\n## Arrival\n\n## Departure\n')
    const [arrival, departure] = plan.nodes[0]!.children

    // Made back to front: the road exists before either Arrival Scene does.
    plan = (await createPlanScene(current, plan, departure!.id, 'The road')).plan
    plan = (await createPlanScene(current, plan, arrival!.id, 'At the gate')).plan
    plan = (await createPlanScene(current, plan, arrival!.id, 'The hall')).plan

    const main = await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')
    expect(main.split('\n').slice(0, 5)).toEqual([
      'INCLUDE ../arrival/at-the-gate.ink',
      'INCLUDE ../arrival/the-hall.ink',
      '',
      'INCLUDE ../departure/the-road.ink',
      ''
    ])
    expect(compileInk({ filePath: join(current.path, 'ink', 'main.ink') }).ok).toBe(true)
  })

  it('keeps ink the plan does not own, and puts it after the story', async () => {
    const current = await project()
    await writeFile(join(current.path, 'ink', 'world.ink'), '=== world ===\nA map.\n-> END\n')
    await writeFile(
      join(current.path, 'ink', 'main.ink'),
      'INCLUDE world.ink\n\n-> start\n\n=== start ===\nReady.\n-> END\n'
    )

    await writePlan(current, planFromMarkdown(SOURCE))

    const main = await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')
    expect(main).toBe(
      [
        'INCLUDE ../arrival/at-the-gate.ink',
        'INCLUDE ../arrival/the-hall.ink',
        '',
        'INCLUDE ../departure/the-road.ink',
        '',
        'INCLUDE world.ink',
        '',
        '-> start',
        '',
        '=== start ===',
        'Ready.',
        '-> END',
        ''
      ].join('\n')
    )
    expect(compileInk({ filePath: join(current.path, 'ink', 'main.ink') }).ok).toBe(true)
  })

  it('leaves the entry point alone once it already says this', async () => {
    const current = await project()
    const stored = await writePlan(current, planFromMarkdown(SOURCE))

    const before = await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')
    const again = await writePlanWithResult(current, stored)

    expect(await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')).toBe(before)
    expect(again.written).not.toContain('ink/main.ink')
  })

  it('adds a new Scene beside its own chapter rather than on top of the file', async () => {
    const current = await project()
    const stored = await writePlan(current, planFromMarkdown(SOURCE))
    const arrival = stored.nodes[0]!.children[0]!

    await createPlanScene(current, stored, arrival.id, 'The threshold')

    const main = await readFile(join(current.path, 'ink', 'main.ink'), 'utf8')
    expect(main.split('\n').slice(0, 4)).toEqual([
      'INCLUDE ../arrival/at-the-gate.ink',
      'INCLUDE ../arrival/the-hall.ink',
      'INCLUDE ../arrival/the-threshold.ink',
      ''
    ])
  })
})
