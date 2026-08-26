import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { Project } from '@shared/project'

/**
 * Moving ink around without breaking the story.
 *
 * The file itself is one `rename`. What earns the tests is everything that
 * named it: the INCLUDE lines in other files, the entry point in the manifest,
 * the files a plan section is attached to — and the moved file's *own*
 * includes, which are written relative to where it used to sit.
 */

let root = ''

vi.mock('./workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

const { readProject, saveProject } = await import('./project')
const { readPlan, writePlan } = await import('./plan')
const {
  addFolder,
  copyInkFile,
  deleteInkPath,
  listInkFolders,
  moveInkFile,
  referencesTo
} = await import('./projectFiles')

let project: Project
let path = ''

const write = async (relative: string, contents: string): Promise<void> => {
  const absolute = join(path, relative.split('/').join(sep))
  await mkdir(join(absolute, '..'), { recursive: true })
  await writeFile(absolute, contents, 'utf8')
}

const read = async (relative: string): Promise<string> =>
  readFile(join(path, relative.split('/').join(sep)), 'utf8')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-files-'))
  path = join(root, 'projects', 'breedhaven')
  await mkdir(join(path, 'ink'), { recursive: true })

  await writeFile(
    join(path, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: Breedhaven\nlibraries: []\nmain: ink/main.ink\n---\n\nA story.\n',
    'utf8'
  )
  await write('ink/main.ink', 'INCLUDE state.ink\nINCLUDE chapter1.ink\n\n-> chapter1\n')
  await write('ink/state.ink', '// generated\nVAR resolve = 0\n')
  await write('ink/chapter1.ink', '=== chapter1 ===\nShe arrives.\n-> END\n')

  project = (await readProject(path))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('moveInkFile', () => {
  it('round-trips the public release profile without storing a private key', async () => {
    project.protection = {
      mode: 'protected',
      keyId: '0123456789abcdef01234567',
      publicKey: 'public-der-base64'
    }

    await saveProject(project)

    expect((await readProject(path))?.protection).toEqual(project.protection)
    expect(await read('project.md')).not.toContain('private')
  })

  it('follows the INCLUDE in another file', async () => {
    await moveInkFile(project, 'ink/chapter1.ink', 'ink/act-one/opening.ink')

    expect(await read('ink/main.ink')).toContain('INCLUDE act-one/opening.ink')
    expect(await read('ink/main.ink')).not.toContain('INCLUDE chapter1.ink')
  })

  it('rewrites the moved file’s own includes for where it now sits', async () => {
    // main.ink reaches its sibling as `state.ink`; from a folder below, the
    // same file is `../state.ink`, and nothing else would have noticed.
    await moveInkFile(project, 'ink/main.ink', 'ink/act-one/main.ink')

    expect(await read('ink/act-one/main.ink')).toContain('INCLUDE ../state.ink')
    expect(await read('ink/act-one/main.ink')).toContain('INCLUDE ../chapter1.ink')
  })

  it('repoints the entry point when the entry point is what moved', async () => {
    await moveInkFile(project, 'ink/main.ink', 'ink/story.ink')

    expect((await readProject(path))!.main).toBe('ink/story.ink')
  })

  it('leaves the entry point alone when something else moved', async () => {
    await moveInkFile(project, 'ink/chapter1.ink', 'ink/two.ink')

    expect((await readProject(path))!.main).toBe('ink/main.ink')
  })

  it('follows a plan attachment and a global', async () => {
    const plan = await readPlan(project)
    await writePlan(project, {
      ...plan,
      globals: ['ink/state.ink'],
      nodes: [
        {
          id: 'pln_0000000001',
          title: 'Act One',
          summary: '',
          status: null,
          tags: [],
          knot: null,
          folder: null,
          files: [],
          children: [
            {
              id: 'pln_0000000002',
              title: 'Chapter One',
              summary: '',
              status: null,
              tags: [],
              knot: null,
              folder: 'ink',
              files: [],
              children: [
                {
                  id: 'pln_0000000003',
                  title: 'Opening',
                  summary: '',
                  status: null,
                  tags: [],
                  knot: 'chapter1',
                  folder: null,
                  files: ['ink/chapter1.ink'],
                  children: []
                }
              ]
            }
          ]
        }
      ]
    })

    await moveInkFile(project, 'ink/chapter1.ink', 'ink/act-one/opening.ink')
    await moveInkFile(project, 'ink/state.ink', 'ink/shared/state.ink')

    const next = await readPlan(project)
    expect(next.nodes[0]!.children[0]!.folder).toBe('ink/act-one')
    expect(next.nodes[0]!.children[0]!.children[0]!.files).toEqual([
      'ink/act-one/opening.ink'
    ])
    expect(next.globals).toEqual(['ink/shared/state.ink'])
  })

  it('reports every file it touched, so the app can reload them', async () => {
    const result = await moveInkFile(project, 'ink/main.ink', 'ink/story.ink')

    expect(result.path).toBe('ink/story.ink')
    expect(result.written).toContain('project.md')
  })

  it('refuses to move onto a file that is already there', async () => {
    await expect(moveInkFile(project, 'ink/chapter1.ink', 'ink/state.ink')).rejects.toThrow(
      /already exists/
    )
    // And nothing moved: rename would have destroyed the destination.
    expect(await read('ink/state.ink')).toContain('VAR resolve')
  })

  it('refuses a path that would escape the project', async () => {
    await expect(moveInkFile(project, 'ink/chapter1.ink', '../../escaped')).rejects.toThrow()
  })

  it('does nothing when the name has not changed', async () => {
    const before = await read('ink/main.ink')
    const result = await moveInkFile(project, 'ink/main.ink', 'ink/main.ink')

    expect(result.written).toEqual([])
    expect(await read('ink/main.ink')).toBe(before)
  })

  it('leaves the folder it emptied behind it', async () => {
    await moveInkFile(project, 'ink/chapter1.ink', 'ink/act-one/opening.ink')
    await moveInkFile(project, 'ink/act-one/opening.ink', 'ink/chapter1.ink')

    expect(await listInkFolders(project)).toEqual(['ink'])
  })
})

describe('copyInkFile', () => {
  it('copies the contents into another folder', async () => {
    await addFolder(project, 'ink/act-two')
    const result = await copyInkFile(project, 'ink/chapter1.ink', 'ink/act-two')

    expect(result.path).toBe('ink/act-two/chapter1.ink')
    expect(await read('ink/act-two/chapter1.ink')).toContain('She arrives.')
    // And the original is still there, which is the difference from a move.
    expect(await read('ink/chapter1.ink')).toContain('She arrives.')
  })

  it('finds a free name rather than writing over what is there', async () => {
    const first = await copyInkFile(project, 'ink/chapter1.ink', 'ink')
    const second = await copyInkFile(project, 'ink/chapter1.ink', 'ink')

    expect(first.path).toBe('ink/chapter1-2.ink')
    expect(second.path).toBe('ink/chapter1-3.ink')
  })

  it('repoints the copy’s own includes for where it landed', async () => {
    await addFolder(project, 'ink/act-two')
    await copyInkFile(project, 'ink/main.ink', 'ink/act-two')

    // The copy reaches the same files from one folder further down.
    expect(await read('ink/act-two/main.ink')).toContain('INCLUDE ../state.ink')
  })

  it('rewrites nothing else, because nothing points at a copy yet', async () => {
    const before = await read('ink/main.ink')
    await copyInkFile(project, 'ink/chapter1.ink', 'ink')

    expect(await read('ink/main.ink')).toBe(before)
    expect((await readProject(path))!.main).toBe('ink/main.ink')
  })

  it('refuses a folder that would escape the project', async () => {
    await expect(copyInkFile(project, 'ink/chapter1.ink', '../../elsewhere')).rejects.toThrow()
  })
})

describe('referencesTo', () => {
  it('finds the include, the entry point and the plan', async () => {
    const plan = await readPlan(project)
    await writePlan(project, { ...plan, globals: ['ink/chapter1.ink'] })

    const references = await referencesTo(project, 'ink/chapter1.ink')

    expect(references.map((one) => one.kind).sort()).toEqual(['include', 'plan'])
    expect(references.find((one) => one.kind === 'include')).toMatchObject({
      file: 'ink/main.ink',
      line: 2
    })
  })

  it('names the entry point for what it is', async () => {
    const references = await referencesTo(project, 'ink/main.ink')
    expect(references.some((one) => one.kind === 'entry')).toBe(true)
  })

  it('does not count a file’s own includes against it', async () => {
    // main.ink includes state.ink; asking about main.ink must not report main.
    const references = await referencesTo(project, 'ink/main.ink')
    expect(references.some((one) => one.file === 'ink/main.ink')).toBe(false)
  })

  it('answers for a whole folder, not just one file', async () => {
    await moveInkFile(project, 'ink/chapter1.ink', 'ink/act-one/opening.ink')

    const references = await referencesTo(project, 'ink/act-one')
    expect(references.some((one) => one.detail.includes('opening.ink'))).toBe(true)
  })

  it('says nothing about a file nothing points at', async () => {
    await write('ink/orphan.ink', '-> END\n')
    expect(await referencesTo(project, 'ink/orphan.ink')).toEqual([])
  })
})

describe('folders', () => {
  it('makes an empty one, which a list of files could never show', async () => {
    await addFolder(project, 'ink/act-two')
    expect(await listInkFolders(project)).toContain('ink/act-two')
  })

  it('refuses to make one that is already there', async () => {
    await addFolder(project, 'ink/act-two')
    await expect(addFolder(project, 'ink/act-two')).rejects.toThrow(/already exists/)
  })

  it('refuses a name that would escape the project', async () => {
    await expect(addFolder(project, '../../elsewhere')).rejects.toThrow()
  })

  it('leaves media and export out of it', async () => {
    await mkdir(join(path, 'media', 'bg'), { recursive: true })
    await mkdir(join(path, 'export'), { recursive: true })

    const folders = await listInkFolders(project)
    expect(folders).not.toContain('media')
    expect(folders).not.toContain('export')
  })
})

describe('deleteInkPath', () => {
  it('deletes one file', async () => {
    await deleteInkPath(project, 'ink/chapter1.ink')
    await expect(read('ink/chapter1.ink')).rejects.toThrow()
  })

  it('deletes a folder and what is inside it', async () => {
    await write('ink/act-one/opening.ink', '-> END\n')
    await deleteInkPath(project, 'ink/act-one')

    await expect(read('ink/act-one/opening.ink')).rejects.toThrow()
    expect(await listInkFolders(project)).not.toContain('ink/act-one')
  })

  it('does not refuse a file something still points at', async () => {
    // The caller asks first, with referencesTo. An author who has been told
    // what breaks and said yes is allowed to break it.
    await deleteInkPath(project, 'ink/chapter1.ink')
    expect(await read('ink/main.ink')).toContain('INCLUDE chapter1.ink')
  })
})
