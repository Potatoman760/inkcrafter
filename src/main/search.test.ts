import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { Project } from '@shared/project'
import type { SearchRequest } from '@shared/types'

/**
 * Finding text across the project's ink.
 *
 * The interesting cases are not "does it find the word". They are the ones an
 * author hits within a minute of using it: searching for `->`, which is regex
 * syntax and must not behave like it; a half-typed regex, which must report
 * rather than throw; and a match at the end of a long line of prose, which is
 * the normal shape of this project's source.
 */

let root = ''

vi.mock('./workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

const { readProject } = await import('./project')
const { searchInk } = await import('./search')

let project: Project
let path = ''

const write = async (relative: string, contents: string): Promise<void> => {
  const absolute = join(path, relative.split('/').join(sep))
  await mkdir(join(absolute, '..'), { recursive: true })
  await writeFile(absolute, contents, 'utf8')
}

const find = (query: string, options: Partial<SearchRequest> = {}) =>
  searchInk(project, { query, caseSensitive: false, regex: false, ...options })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-search-'))
  path = join(root, 'projects', 'breedhaven')
  await mkdir(join(path, 'ink'), { recursive: true })

  await writeFile(
    join(path, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: Breedhaven\nlibraries: []\nmain: ink/main.ink\n---\n\nA story.\n',
    'utf8'
  )
  await write('ink/main.ink', 'INCLUDE chapter1.ink\n\n-> maren_road\n')
  await write(
    'ink/chapter1.ink',
    '=== maren_road ===\nShe stepped out of the alder shade.\nMaren: You may stare.\n-> maren_road\n'
  )

  project = (await readProject(path))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('searchInk', () => {
  it('finds every occurrence, in file then line order, with 1-based lines', async () => {
    const { hits } = await find('maren_road')

    expect(hits.map((hit) => [hit.file, hit.line])).toEqual([
      ['ink/chapter1.ink', 1],
      ['ink/chapter1.ink', 4],
      ['ink/main.ink', 3]
    ])
  })

  it('ignores case by default and respects it when asked', async () => {
    expect((await find('MAREN')).hits.length).toBeGreaterThan(0)
    expect((await find('MAREN', { caseSensitive: true })).hits).toEqual([])
    expect((await find('Maren', { caseSensitive: true })).hits).toHaveLength(1)
  })

  it('reports a line matching twice as two hits', async () => {
    await write('ink/chapter1.ink', 'Maren looked at Maren.\n')

    // Case-sensitive so the lowercase `maren_road` still in main.ink stays out
    // of it; this is about one line, not about the project.
    const { hits } = await find('Maren', { caseSensitive: true })

    expect(hits).toHaveLength(2)
    expect(hits.map((hit) => hit.column)).toEqual([0, 16])
  })

  // `->` is the most searched-for string in an ink project and every character
  // of it is regex syntax.
  it('treats the query as literal text unless regex is asked for', async () => {
    const { hits } = await find('-> maren_road')

    expect(hits.map((hit) => hit.file)).toEqual(['ink/chapter1.ink', 'ink/main.ink'])
  })

  it('searches by regex when asked', async () => {
    const { hits } = await find('=== [a-z_]+ ===', { regex: true })

    expect(hits).toHaveLength(1)
    expect(hits[0]!.line).toBe(1)
  })

  it('reports a half-typed regex rather than throwing', async () => {
    const result = await find('(maren', { regex: true })

    expect(result.hits).toEqual([])
    expect(result.problem).not.toBeNull()
  })

  it('terminates on a pattern that can match nothing', async () => {
    const { hits } = await find('x*', { regex: true })

    expect(hits.length).toBeGreaterThan(0)
  })

  it('finds nothing for an empty query, without complaining', async () => {
    expect(await find('')).toEqual({ hits: [], capped: false, problem: null })
  })

  // A prose line runs hundreds of characters and the match is often at the end
  // of it, where a preview of the first 200 would not show it at all.
  it('clips a long line around the match and points the column into the clip', async () => {
    const lead = 'She stepped out of the alder shade as though the wood had made her. '.repeat(6)
    await write('ink/chapter1.ink', `${lead}foxfire\n`)

    const { hits } = await find('foxfire')
    const hit = hits[0]!

    expect(hit.preview.length).toBeLessThan(lead.length)
    expect(hit.preview.startsWith('\u2026')).toBe(true)
    expect(hit.preview.slice(hit.column, hit.column + hit.length)).toBe('foxfire')
  })

  it('points the column into the line itself when the line is short', async () => {
    const { hits } = await find('alder')
    const hit = hits[0]!

    expect(hit.preview).toBe('She stepped out of the alder shade.')
    expect(hit.preview.slice(hit.column, hit.column + hit.length)).toBe('alder')
  })
})
