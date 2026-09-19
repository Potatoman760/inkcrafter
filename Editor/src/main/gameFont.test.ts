import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Project } from '@shared/project'
import { importGameFont } from './gameFont'

let root: string
let project: Project

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-font-'))
  project = {
    id: 'prj_fonttest00', title: 'Font test', libraries: [], main: 'ink/main.ink',
    description: '', bundleOut: null, path: join(root, 'project')
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('game font import', () => {
  it('copies a supported font into a safe project-relative path', async () => {
    const source = join(root, 'My Display Font.WOFF2')
    await writeFile(source, 'font bytes')

    const result = await importGameFont(project, source)

    expect(result).toEqual({
      ok: true,
      cancelled: false,
      file: 'fonts/My-Display-Font.woff2',
      message: ''
    })
    expect(await readFile(join(project.path, result.file!), 'utf8')).toBe('font bytes')
  })

  it('never overwrites a font with the same name', async () => {
    const source = join(root, 'dialogue.ttf')
    await writeFile(source, 'first')
    expect((await importGameFont(project, source)).file).toBe('fonts/dialogue.ttf')
    await writeFile(source, 'second')

    const next = await importGameFont(project, source)

    expect(next.file).toBe('fonts/dialogue-2.ttf')
    expect(await readFile(join(project.path, 'fonts/dialogue.ttf'), 'utf8')).toBe('first')
    expect(await readFile(join(project.path, 'fonts/dialogue-2.ttf'), 'utf8')).toBe('second')
  })

  it('refuses unsupported and empty files', async () => {
    const wrong = join(root, 'font.exe')
    const empty = join(root, 'font.otf')
    await writeFile(wrong, 'no')
    await writeFile(empty, '')

    expect((await importGameFont(project, wrong)).ok).toBe(false)
    expect((await importGameFont(project, empty)).message).toMatch(/empty/)
  })
})
