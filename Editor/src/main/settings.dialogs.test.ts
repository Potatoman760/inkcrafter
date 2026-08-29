import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let root = ''

vi.mock('electron', () => ({
  app: { getPath: () => root },
  safeStorage: { isEncryptionAvailable: () => true }
}))

const { lastUploadDir, setLastUploadDir } = await import('./settings')
const file = (): string => join(root, 'settings.json')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-dialogs-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('upload dialog settings', () => {
  it('has no preferred folder on an existing install', async () => {
    await writeFile(file(), JSON.stringify({ version: 1, providers: [], activeProviderId: null }))
    expect(await lastUploadDir()).toBeNull()
  })

  it('persists the last successful upload folder', async () => {
    await setLastUploadDir('D:\\visual-novel\\source-art')

    expect(await lastUploadDir()).toBe('D:\\visual-novel\\source-art')
    expect(JSON.parse(await readFile(file(), 'utf8')).lastUploadDir).toBe(
      'D:\\visual-novel\\source-art'
    )
  })

  it('ignores a malformed value from disk', async () => {
    await writeFile(file(), JSON.stringify({ version: 1, lastUploadDir: ['not', 'a', 'path'] }))
    expect(await lastUploadDir()).toBeNull()
  })
})
