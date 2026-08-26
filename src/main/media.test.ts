import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { addAsset, addVariant, emptyMedia, newAsset, newVariant } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import { deleteMediaFile, writeMedia } from './media'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<Project> {
  const path = await mkdtemp(join(tmpdir(), 'inkcrafter-media-'))
  roots.push(path)
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

describe('deleting media files', () => {
  it('deletes an unclaimed file and prunes its empty folders', async () => {
    const current = await project()
    const folder = join(current.path, 'media', 'scratch')
    const file = join(folder, 'unused.png')
    await mkdir(folder, { recursive: true })
    await writeFile(file, 'pixels')

    await deleteMediaFile(current, 'scratch/unused.png')

    await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(folder)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to delete a file still claimed by the catalogue', async () => {
    const current = await project()
    const folder = join(current.path, 'media', 'bg')
    const file = join(folder, 'harbour.png')
    await mkdir(folder, { recursive: true })
    await writeFile(file, 'pixels')

    const asset = newAsset('Harbour', 'background')
    const doc = addVariant(addAsset(emptyMedia(), asset), asset.id, newVariant('day', 'bg/harbour.png'))
    await writeMedia(current, doc)

    await expect(deleteMediaFile(current, 'bg/harbour.png')).rejects.toThrow(/still used/)
    await expect(access(file)).resolves.toBeUndefined()
  })
})
