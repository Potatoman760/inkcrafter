import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Project } from '@shared/project'
import { importGameIcon, listGameIcons } from './gameIcon'

vi.mock('./workspace', () => ({ dataDir: () => tmpdir() }))

let root: string
let project: Project

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-icon-'))
  project = {
    id: 'prj_icontest000', title: 'Icon test', libraries: [], main: 'ink/main.ink',
    description: '', bundleOut: null, path: join(root, 'project')
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('game icon import', () => {
  it('copies and lists a portable image under the project', async () => {
    const source = join(root, 'Game Mark.PNG')
    await writeFile(source, 'png bytes')

    const result = await importGameIcon(project, source)

    expect(result).toMatchObject({
      ok: true,
      cancelled: false,
      file: 'icons/Game-Mark.png',
      message: ''
    })
    expect(result.url).toMatch(/^app:\/\/media\//)
    expect(await readFile(join(project.path, result.file!), 'utf8')).toBe('png bytes')
    expect(await listGameIcons(project)).toEqual([{ file: result.file, url: result.url }])
  })

  it('keeps an existing icon when another upload has the same name', async () => {
    const source = join(root, 'mark.jpg')
    await writeFile(source, 'first')
    expect((await importGameIcon(project, source)).file).toBe('icons/mark.jpg')
    await writeFile(source, 'second')

    const next = await importGameIcon(project, source)

    expect(next.file).toBe('icons/mark-2.jpg')
    expect(await readFile(join(project.path, 'icons/mark.jpg'), 'utf8')).toBe('first')
    expect(await readFile(join(project.path, 'icons/mark-2.jpg'), 'utf8')).toBe('second')
  })

  it('refuses unsupported and empty files', async () => {
    const wrong = join(root, 'mark.svg')
    const empty = join(root, 'mark.png')
    await writeFile(wrong, '<svg/>')
    await writeFile(empty, '')

    expect((await importGameIcon(project, wrong)).message).toMatch(/PNG or JPEG/)
    expect((await importGameIcon(project, empty)).message).toMatch(/empty/)
  })
})
