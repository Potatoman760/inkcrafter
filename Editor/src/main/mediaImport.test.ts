import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Project } from '@shared/project'

/**
 * Bringing a picture into a project.
 *
 * Real files in real folders, because every case that matters here is about
 * what is on disk afterwards: where the new one landed, which of the old ones
 * moved, and — the one worth being careful about — that nothing was destroyed
 * on the way.
 */

vi.mock('electron', () => ({
  net: { fetch: async () => new Response(null) },
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} }
}))

const { importLook } = await import('./mediaImport')

let root = ''
let outside = ''

const project = (): Project =>
  ({ id: 'prj_0000000000', title: 'Probe', path: root }) as unknown as Project

const media = (...parts: string[]): string => join(root, 'media', ...parts)

async function put(file: string, body = 'a picture'): Promise<string> {
  const path = media(...file.split('/'))
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, body)
  return path
}

async function source(name: string, body = 'chosen'): Promise<string> {
  const path = join(outside, name)
  await writeFile(path, body)
  return path
}

const listed = async (folder: string): Promise<string[]> =>
  (await readdir(media(...folder.split('/')))).sort()

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-import-'))
  outside = await mkdtemp(join(tmpdir(), 'inkcrafter-source-'))
  await mkdir(media(), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('importLook', () => {
  it('copies the file in under the look’s name, in the asset’s folder', async () => {
    const chosen = await source('DSC_4471 final (2).png')

    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: [] },
      chosen
    )

    expect(result.ok).toBe(true)
    expect(result.file).toBe('characters/kael/happy.png')
    // The file's own name does not travel: what the author will look for is
    // the look, and the app decides the folder.
    expect(await readFile(media('characters', 'kael', 'happy.png'), 'utf8')).toBe('chosen')
  })

  it('leaves the original where it was', async () => {
    const chosen = await source('sprite.png')
    await importLook(project(), { kind: 'character', asset: 'kael', look: 'happy', gather: [] }, chosen)

    // Copied, never moved: the file is the author's, and it is theirs still.
    expect(await readFile(chosen, 'utf8')).toBe('chosen')
  })

  it('files a track like anything else, keeping what it is', async () => {
    const result = await importLook(
      project(),
      { kind: 'music', asset: 'the_grove', look: 'loop', gather: [] },
      await source('grove theme final.mp3')
    )

    expect(result.file).toBe('music/the_grove/loop.mp3')
  })

  it('files a one-shot cue under sounds', async () => {
    const result = await importLook(
      project(),
      { kind: 'sound', asset: 'door_slam', look: 'heavy', gather: [] },
      await source('door slam final.ogg')
    )

    expect(result.file).toBe('sounds/door_slam/heavy.ogg')
  })

  it('keeps the extension it was given', async () => {
    const result = await importLook(
      project(),
      { kind: 'background', asset: 'the_storm', look: 'full', gather: [] },
      await source('storm.mp4')
    )

    expect(result.file).toBe('backgrounds/the_storm/full.mp4')
  })

  it('files each kind in its own folder', async () => {
    for (const [kind, expected] of [
      ['background', 'backgrounds/harbour/dusk.png'],
      ['hotspot', 'hotspots/harbour/idle.png']
    ] as const) {
      const result = await importLook(
        project(),
        { kind, asset: 'harbour', look: kind === 'hotspot' ? 'idle' : 'dusk', gather: [] },
        await source(`${kind}.png`)
      )
      expect(result.file).toBe(expected)
    }
  })

  it('gathers the asset’s other looks in beside it', async () => {
    await put('sprites/kael-neutral.png', 'neutral')
    await put('sprites/kael-wary.png', 'wary')

    const result = await importLook(
      project(),
      {
        kind: 'character',
        asset: 'kael',
        look: 'happy',
        gather: ['sprites/kael-neutral.png', 'sprites/kael-wary.png']
      },
      await source('happy.png')
    )

    expect(result.moved).toEqual([
      { from: 'sprites/kael-neutral.png', to: 'characters/kael/kael-neutral.png' },
      { from: 'sprites/kael-wary.png', to: 'characters/kael/kael-wary.png' }
    ])

    // One character, one folder — which is the whole reason for gathering.
    expect(await listed('characters/kael')).toEqual([
      'happy.png',
      'kael-neutral.png',
      'kael-wary.png'
    ])
    // And the contents travelled, not just the names.
    expect(await readFile(media('characters', 'kael', 'kael-neutral.png'), 'utf8')).toBe('neutral')
  })

  it('clears away the folder a gathered file emptied', async () => {
    await put('sprites/kael-neutral.png')

    await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: ['sprites/kael-neutral.png'] },
      await source('happy.png')
    )

    // Left behind, `sprites/` sits there empty implying art that has moved out.
    expect(await listed('')).toEqual(['characters'])
  })

  it('leaves a look already in the right place exactly alone', async () => {
    await put('characters/kael/neutral.png', 'neutral')

    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: ['characters/kael/neutral.png'] },
      await source('happy.png')
    )

    expect(result.moved).toEqual([])
    expect(await readFile(media('characters', 'kael', 'neutral.png'), 'utf8')).toBe('neutral')
  })

  it('does not overwrite a file that is already there', async () => {
    await put('characters/kael/happy.png', 'the one already there')

    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: [] },
      await source('happy.png')
    )

    expect(result.file).toBe('characters/kael/happy-2.png')
    expect(await readFile(media('characters', 'kael', 'happy.png'), 'utf8')).toBe(
      'the one already there'
    )
  })

  it('carries on when a look in the catalogue is not on disk', async () => {
    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: ['sprites/gone.png'] },
      await source('happy.png')
    )

    // A catalogue entry pointing at nothing is a state the app expects; it is
    // not a reason to refuse the import.
    expect(result.ok).toBe(true)
    expect(result.moved).toEqual([])
  })

  it('refuses something that is neither a picture, a clip nor a track', async () => {
    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: [] },
      await source('notes.txt')
    )

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/not a picture, a clip or a track/)
  })

  it('refuses an empty file rather than filing a look that shows nothing', async () => {
    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: [] },
      await source('empty.png', '')
    )

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/empty/)
  })

  it('says so rather than throwing when the file has gone', async () => {
    const result = await importLook(
      project(),
      { kind: 'character', asset: 'kael', look: 'happy', gather: [] },
      join(outside, 'never-existed.png')
    )

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Could not read/)
  })
})
