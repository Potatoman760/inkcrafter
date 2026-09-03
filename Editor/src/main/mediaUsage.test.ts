import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { Project } from '@shared/project'

/**
 * Where a picture, track or clip is actually used.
 *
 * The interesting part is not finding the tag — `scanTags` does that and has
 * its own tests — but attributing it to a knot, which is what an author is
 * looking for when they ask where a sprite is shown.
 */

let root = ''

vi.mock('./workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

const { readProject } = await import('./project')
const { mediaUsage } = await import('./mediaUsage')

let project: Project
let path = ''

const write = async (relative: string, contents: string): Promise<void> => {
  const absolute = join(path, relative.split('/').join(sep))
  await mkdir(join(absolute, '..'), { recursive: true })
  await writeFile(absolute, contents, 'utf8')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-usage-'))
  path = join(root, 'projects', 'breedhaven')
  await mkdir(join(path, 'ink'), { recursive: true })

  await writeFile(
    join(path, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: Breedhaven\nlibraries: []\nmain: ink/main.ink\n---\n\nA story.\n',
    'utf8'
  )

  project = (await readProject(path))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('mediaUsage', () => {
  it('files each use under the knot it sits in', async () => {
    await write(
      'ink/main.ink',
      [
        '=== arrival ===',
        '# bg: harbour/day',
        'She arrives.',
        '',
        '=== departure ===',
        '# bg: harbour/night',
        'She leaves.'
      ].join('\n')
    )

    const usage = await mediaUsage(project)

    expect(usage['background:harbour']).toEqual([
      { file: 'ink/main.ink', line: 2, knot: 'arrival', variant: 'day', raw: 'bg: harbour/day' },
      {
        file: 'ink/main.ink',
        line: 6,
        knot: 'departure',
        variant: 'night',
        raw: 'bg: harbour/night'
      }
    ])
  })

  // A stitch is the innermost section, and is what an author would go looking
  // for rather than the knot containing it.
  it('names the stitch when the tag is inside one', async () => {
    await write(
      'ink/main.ink',
      ['=== town ===', '= market', '# char: wren/happy', 'She waves.'].join('\n')
    )

    expect((await mediaUsage(project))['character:wren']?.[0]?.knot).toBe('town.market')
  })

  it('says so when a tag sits above the first knot', async () => {
    await write('ink/main.ink', ['# music: theme loop', '=== start ===', 'Here.'].join('\n'))

    expect((await mediaUsage(project))['music:theme']?.[0]?.knot).toBeNull()
  })

  it('gathers uses across files, and counts each one', async () => {
    await write('ink/main.ink', ['=== one ===', '# bg: cove', 'A.'].join('\n'))
    await write('ink/two.ink', ['=== two ===', '# bg: cove', 'B.', '# bg: cove', 'C.'].join('\n'))

    const uses = (await mediaUsage(project))['background:cove'] ?? []

    expect(uses).toHaveLength(3)
    expect(uses.map((one) => one.file)).toEqual(['ink/main.ink', 'ink/two.ink', 'ink/two.ink'])
  })

  // An asset nothing names is the question this answers, so it must come back
  // as nothing rather than as an error.
  it('leaves an unused asset out entirely', async () => {
    await write('ink/main.ink', ['=== one ===', '# bg: cove', 'A.'].join('\n'))

    expect((await mediaUsage(project))['background:unused']).toBeUndefined()
  })

  it('ignores a tag that names no media, and one it cannot read', async () => {
    await write(
      'ink/main.ink',
      ['=== one ===', '# stat: courage +1', '# bg:', '# speaker: Wren', 'A.'].join('\n')
    )

    expect(Object.keys(await mediaUsage(project))).toEqual([])
  })
})
