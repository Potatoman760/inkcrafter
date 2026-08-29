import { createHash, generateKeyPair } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectProtection } from '@shared/project'
import { checkPlayer } from './player'
import { loadSettings, releasePrivateKeyFor, storeReleasePrivateKey } from './settings'

interface PlayerReleaseKeyring {
  version: 1
  keys: Record<string, string>
}

/** Generate once; exports retain only the public half while the player receives the private half. */
export async function generateProjectProtection(): Promise<ProjectProtection> {
  const pair = await new Promise<{ publicKey: Buffer; privateKey: Buffer }>((resolve, reject) => {
    generateKeyPair(
      'rsa',
      {
        modulusLength: 3072,
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' }
      },
      (error, publicKey, privateKey) => error ? reject(error) : resolve({ publicKey, privateKey })
    )
  })
  const keyId = createHash('sha256').update(pair.publicKey).digest('hex').slice(0, 24)
  await storeReleasePrivateKey(keyId, pair.privateKey.toString('base64'))
  return { mode: 'protected', keyId, publicKey: pair.publicKey.toString('base64') }
}

/** Install a generated private key into the connected player's untracked build-time keyring. */
export async function installProjectProtection(
  profile: ProjectProtection
): Promise<{ ok: boolean; message: string }> {
  const privateKey = await releasePrivateKeyFor(profile.keyId)
  if (!privateKey) {
    return {
      ok: false,
      message: 'This machine does not have that release key. Generate a new key for future exports.'
    }
  }

  const { playerDir } = await loadSettings()
  if (!playerDir) return { ok: false, message: 'Choose a connected player in Settings first.' }
  const player = await checkPlayer(playerDir)
  if (!player.ok) return { ok: false, message: player.problem ?? 'The connected player is not available.' }

  const folder = join(playerDir, '.inkcrafter')
  const path = join(folder, 'release-keys.json')
  let keyring: PlayerReleaseKeyring = { version: 1, keys: {} }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<PlayerReleaseKeyring>
    if (parsed.version === 1 && parsed.keys && typeof parsed.keys === 'object') {
      keyring = { version: 1, keys: { ...parsed.keys } }
    }
  } catch {
    // First key, or a malformed untracked file: replace it with the known shape.
  }

  keyring.keys[profile.keyId] = privateKey
  await mkdir(folder, { recursive: true })
  await writeFile(path, `${JSON.stringify(keyring, null, 2)}\n`, 'utf8')
  return {
    ok: true,
    message: `Installed release key ${profile.keyId} in the connected player. Restart the development player or rebuild it before opening protected exports.`,
  }
}
