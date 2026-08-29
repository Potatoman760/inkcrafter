import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let root = ''

vi.mock('electron', () => ({
  app: { getPath: () => root },
  safeStorage: { isEncryptionAvailable: () => true }
}))

const { loadSettings, setInterfaceScale } = await import('./settings')
const file = (): string => join(root, 'settings.json')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-appearance-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('interface size setting', () => {
  it('defaults old settings files to 100%', async () => {
    await writeFile(file(), JSON.stringify({ version: 1, providers: [] }))
    expect((await loadSettings()).interfaceScale).toBe(1)
  })

  it('persists the chosen scale', async () => {
    expect((await setInterfaceScale(1.25)).interfaceScale).toBe(1.25)
    expect(JSON.parse(await readFile(file(), 'utf8')).interfaceScale).toBe(1.25)
  })

  it('clamps malformed or extreme values to a usable range', async () => {
    expect((await setInterfaceScale(20)).interfaceScale).toBe(1.5)
    expect((await setInterfaceScale(Number.NaN)).interfaceScale).toBe(1)
  })
})
