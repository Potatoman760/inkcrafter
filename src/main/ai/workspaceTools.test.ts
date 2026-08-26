import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isId } from '@shared/ids'
import { runTool, type ToolContext } from './workspaceTools'

let root: string
let context: ToolContext

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-tools-'))
  context = { root, written: [], project: null }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const call = (name: string, args: unknown) => runTool(name, JSON.stringify(args), context)

async function seed(): Promise<void> {
  await mkdir(join(root, 'projects', 'the-lighthouse', 'ink'), { recursive: true })
  await writeFile(join(root, 'projects', 'the-lighthouse', 'project.md'), '---\ntitle: X\n---\n\nY\n')
  await writeFile(join(root, 'projects', 'the-lighthouse', 'ink', 'main.ink'), '-> start\n')
}

describe('list_files', () => {
  it('lists the workspace, marking folders', async () => {
    await seed()
    const result = await call('list_files', {})

    expect(result.ok).toBe(true)
    expect(result.content).toContain('projects/')
    expect(result.content).toContain('projects/the-lighthouse/ink/main.ink')
  })

  it('lists one folder rather than everything', async () => {
    await seed()
    const result = await call('list_files', { path: 'projects/the-lighthouse/ink' })

    expect(result.content).toContain('main.ink')
    expect(result.content).not.toContain('project.md')
  })

  it('says a missing folder is empty rather than failing the turn', async () => {
    const result = await call('list_files', { path: 'projects/nothing-here' })
    expect(result.ok).toBe(true)
    expect(result.content).toMatch(/empty/)
  })

  it('hides dot directories', async () => {
    await mkdir(join(root, '.git'), { recursive: true })
    await writeFile(join(root, '.git', 'config'), 'secret')

    const result = await call('list_files', {})
    expect(result.content).not.toContain('.git')
  })
})

describe('read_file', () => {
  it('reads a file', async () => {
    await seed()
    const result = await call('read_file', { path: 'projects/the-lighthouse/ink/main.ink' })

    expect(result.ok).toBe(true)
    expect(result.content).toBe('-> start\n')
  })

  it('reports a missing file as text the model can act on', async () => {
    const result = await call('read_file', { path: 'projects/x/nope.ink' })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/does not exist/)
  })
})

describe('write_file', () => {
  it('creates a file and the folders above it', async () => {
    const result = await call('write_file', {
      path: 'projects/new-story/ink/chapters/one.ink',
      contents: '=== one ===\nIt begins.\n-> END\n'
    })

    expect(result.ok).toBe(true)
    expect(await readFile(join(root, 'projects/new-story/ink/chapters/one.ink'), 'utf8')).toContain(
      'It begins.'
    )
    expect(context.written).toEqual(['projects/new-story/ink/chapters/one.ink'])
  })

  // The author's work has no backups here, so replacing it has to be deliberate.
  it('refuses to replace an existing file without being told to', async () => {
    await seed()
    const result = await call('write_file', {
      path: 'projects/the-lighthouse/ink/main.ink',
      contents: 'gone'
    })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/already exists/)
    expect(await readFile(join(root, 'projects/the-lighthouse/ink/main.ink'), 'utf8')).toBe('-> start\n')
    expect(context.written).toEqual([])
  })

  it('replaces it when told to, and says that is what it did', async () => {
    await seed()
    const result = await call('write_file', {
      path: 'projects/the-lighthouse/ink/main.ink',
      contents: '-> other\n',
      overwrite: true
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toMatch(/^replaced/)
    expect(await readFile(join(root, 'projects/the-lighthouse/ink/main.ink'), 'utf8')).toBe('-> other\n')
  })

  it('refuses a file type the app does not read', async () => {
    const result = await call('write_file', { path: 'projects/x/run.js', contents: 'x' })
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/only .* can be written/)
  })

  it('refuses to escape the workspace, and does not create anything', async () => {
    const result = await call('write_file', { path: '../escaped.md', contents: 'x' })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/leave the workspace/)
    expect(context.written).toEqual([])
  })

  it('refuses a file large enough to be a mistake', async () => {
    const result = await call('write_file', { path: 'a.md', contents: 'x'.repeat(500_000) })
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/larger than/)
  })
})

describe('new_id', () => {
  it('generates ids the app will accept', async () => {
    const result = await call('new_id', { kind: 'pln', count: 3 })
    const ids = result.content.split('\n')

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) {
      expect(id.startsWith('pln_')).toBe(true)
      expect(isId(id)).toBe(true)
    }
  })

  it('refuses a kind the app does not have', async () => {
    const result = await call('new_id', { kind: 'chapter' })
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/Unknown kind/)
  })

  it('caps a runaway count instead of generating thousands', async () => {
    const result = await call('new_id', { kind: 'cdx', count: 5000 })
    expect(result.content.split('\n')).toHaveLength(50)
  })
})

describe('runTool', () => {
  it('tells the model when it names a tool that does not exist', async () => {
    const result = await call('delete_everything', {})
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/no tool called/)
  })

  // Models emit malformed JSON often enough that this must not kill the turn.
  it('survives unreadable arguments and explains them', async () => {
    const result = await runTool('read_file', '{"path": ', context)
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/Could not read the arguments/)
  })

  it('treats empty arguments as an empty object', async () => {
    const result = await runTool('list_files', '', context)
    expect(result.ok).toBe(true)
  })

  it('rejects arguments that are not an object', async () => {
    const result = await runTool('list_files', '["path"]', context)
    expect(result.ok).toBe(false)
  })
})
