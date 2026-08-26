import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let root = ''
let available = true

vi.mock('electron', () => ({
  app: { getPath: () => root },
  safeStorage: {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(`sealed:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, '')
  }
}))

const { releasePrivateKeyFor, storeReleasePrivateKey } = await import('./settings')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-release-key-'))
  available = true
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('release key storage', () => {
  it('round-trips through safeStorage without writing the private key in cleartext', async () => {
    await storeReleasePrivateKey('release-one', 'private-pkcs8')

    const written = await readFile(join(root, 'settings.json'), 'utf8')
    expect(written).not.toContain('private-pkcs8')
    expect(written).toContain(Buffer.from('sealed:private-pkcs8').toString('base64'))
    expect(await releasePrivateKeyFor('release-one')).toBe('private-pkcs8')
  })

  it('refuses a cleartext downgrade when the OS keystore is unavailable', async () => {
    available = false
    await expect(storeReleasePrivateKey('release-one', 'private-pkcs8')).rejects.toThrow(
      'keystore is unavailable'
    )
  })
})
