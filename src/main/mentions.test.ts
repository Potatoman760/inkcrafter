import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { newEntry, type CodexEntry } from '@shared/codex'
import type { Project } from '@shared/project'

/**
 * Counting a codex entry's mentions across the whole story.
 *
 * The counting itself is `findMentions`, which has its own tests. What is worth
 * pinning here is what this adds: that every file is read rather than one, that
 * the unsaved buffer wins over what is on disk, and that a file which cannot be
 * read costs its own count rather than the whole answer.
 */

let root = ''

vi.mock('./workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

const { readProject } = await import('./project')
const { countMentionsAcross } = await import('./mentions')

let project: Project
let path = ''

const entry = (name: string, aliases: string[] = []): CodexEntry => ({
  ...newEntry('lib_1', name),
  aliases
})

const dinah = entry('Dinah', ['Silverith'])
const maren = entry('Maren')
const ghost = entry('Ghost')

const write = async (relative: string, contents: string): Promise<void> => {
  const absolute = join(path, relative.split('/').join(sep))
  await mkdir(join(absolute, '..'), { recursive: true })
  await writeFile(absolute, contents, 'utf8')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-mentions-'))
  path = join(root, 'projects', 'breedhaven')
  await mkdir(join(path, 'ink'), { recursive: true })

  await writeFile(
    join(path, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: Breedhaven\nlibraries: []\nmain: ink/main.ink\n---\n\nA story.\n',
    'utf8'
  )
  await write('ink/main.ink', 'Dinah waited at the gate.\n')
  await write('ink/two.ink', 'Dinah spoke. Maren listened to Dinah.\n')

  project = (await readProject(path))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('countMentionsAcross', () => {
  it('adds up every ink file, not just one', async () => {
    const counts = await countMentionsAcross(project, { entries: [dinah, maren] })

    expect(counts[dinah.id]).toBe(3)
    expect(counts[maren.id]).toBe(1)
  })

  it('counts aliases as the entry they belong to', async () => {
    await write('ink/two.ink', 'Silverith crossed the yard.\n')

    const counts = await countMentionsAcross(project, { entries: [dinah] })

    expect(counts[dinah.id]).toBe(2)
  })

  // The file being edited is usually dirty, and a count read from disk would
  // lag the prose being typed by a whole save.
  it('reads the unsaved buffer instead of the file it belongs to', async () => {
    const counts = await countMentionsAcross(project, {
      entries: [dinah],
      overrides: { [join(path, 'ink', 'two.ink')]: 'Nobody at all.\n' }
    })

    expect(counts[dinah.id]).toBe(1)
  })

  it('leaves an entry out entirely when nothing names it', async () => {
    const counts = await countMentionsAcross(project, { entries: [ghost] })

    expect(counts[ghost.id]).toBeUndefined()
  })

  it('answers nothing for no entries, without reading anything', async () => {
    expect(await countMentionsAcross(project, { entries: [] })).toEqual({})
  })
})
