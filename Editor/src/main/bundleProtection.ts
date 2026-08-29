import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomUUID
} from 'node:crypto'
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import type { ProjectProtection } from '@shared/project'
import { BUNDLE_FILES, BUNDLE_MEDIA_DIR, type BundleManifest } from '@shared/bundle/manifest'
import {
  PROTECTED_CHUNK_BYTES,
  PROTECTED_CONTENT_DIR,
  PROTECTED_FILE_HEADER_BYTES,
  PROTECTED_FILE_MAGIC,
  PROTECTED_FILE_VERSION,
  PROTECTED_GCM_TAG_BYTES,
  PROTECTED_BUNDLE_FORMAT,
  PROTECTION_SCHEME,
  protectedChunkAad,
  type ProtectedAssetFile,
  type ProtectedBundleHeader,
  type ProtectedBundlePayload
} from '@shared/bundle/protection'

/**
 * Replaces a complete plain staging bundle with its protected representation.
 *
 * Done only after compile, preflight and media copying have succeeded: those
 * operations want ordinary files, while this boundary is concerned only with
 * what leaves the author's machine. The staging directory is disposable, so a
 * failed encryption can never damage the previous export.
 */
export async function protectStagingBundle(
  staging: string,
  profile: ProjectProtection,
  manifest: BundleManifest
): Promise<ProtectedBundleHeader> {
  const contentKey = randomBytes(32)
  const exportNonce = randomBytes(4)
  const contentDir = join(staging, PROTECTED_CONTENT_DIR)
  await mkdir(contentDir, { recursive: true })

  const assetFiles: ProtectedAssetFile[] = manifest.assets.map((asset) => ({
    logicalPath: asset.path,
    path: opaquePath(),
    plainBytes: asset.bytes,
    mime: mimeFor(asset.path)
  }))

  const documents = await Promise.all([
    readFile(join(staging, BUNDLE_FILES.story), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.catalogue), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.media), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.npcs), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.map), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.gallery), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.achievements), 'utf8'),
    readFile(join(staging, BUNDLE_FILES.minigames), 'utf8'),
    optionalText(join(staging, BUNDLE_FILES.preview))
  ])

  const payload: ProtectedBundlePayload = {
    manifest,
    documents: {
      story: documents[0],
      catalogue: documents[1],
      media: documents[2],
      npcs: documents[3],
      map: documents[4],
      gallery: documents[5],
      achievements: documents[6],
      minigames: documents[7],
      preview: documents[8]
    },
    assets: assetFiles
  }

  // One bounded pass per media file. In particular, a 300 MB clip is never
  // held beside a second 300 MB copy in the exporter.
  for (let index = 0; index < assetFiles.length; index += 1) {
    const protectedFile = assetFiles[index]
    if (!protectedFile) continue
    const source = join(staging, protectedFile.logicalPath.split('/').join(sep))
    await encryptFile(
      source,
      join(staging, protectedFile.path.split('/').join(sep)),
      contentKey,
      noncePrefix(exportNonce, index + 1),
      profile.keyId,
      protectedFile.logicalPath
    )
  }

  const payloadJson = Buffer.from(JSON.stringify(payload), 'utf8')
  const payloadRef = { path: opaquePath(), plainBytes: payloadJson.byteLength }
  await encryptBytes(
    payloadJson,
    join(staging, payloadRef.path.split('/').join(sep)),
    contentKey,
    noncePrefix(exportNonce, 0),
    profile.keyId,
    'bundle-payload'
  )

  const publicKey = createPublicKey({
    key: Buffer.from(profile.publicKey, 'base64'),
    format: 'der',
    type: 'spki'
  })
  const wrappedKey = publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, contentKey)
  const header: ProtectedBundleHeader = {
    format: PROTECTED_BUNDLE_FORMAT,
    generatedBy: 'InkCrafter',
    generatedAt: manifest.generatedAt,
    protection: {
      scheme: PROTECTION_SCHEME,
      keyId: profile.keyId,
      wrappedKey: wrappedKey.toString('base64'),
      payload: payloadRef
    }
  }

  await Promise.all([
    rm(join(staging, BUNDLE_MEDIA_DIR), { recursive: true, force: true }),
    ...Object.values(BUNDLE_FILES)
      .filter((file) => file !== BUNDLE_FILES.manifest)
      .map((file) => rm(join(staging, file), { force: true }))
  ])
  await writeFile(join(staging, BUNDLE_FILES.manifest), `${JSON.stringify(header, null, 2)}\n`, 'utf8')
  return header
}

function opaquePath(): string {
  return `${PROTECTED_CONTENT_DIR}/${randomUUID().replaceAll('-', '')}.icp`
}

function noncePrefix(exportNonce: Buffer, fileIndex: number): Buffer {
  const prefix = Buffer.allocUnsafe(8)
  exportNonce.copy(prefix, 0)
  prefix.writeUInt32BE(fileIndex, 4)
  return prefix
}

async function encryptFile(
  from: string,
  to: string,
  key: Buffer,
  prefix: Buffer,
  keyId: string,
  logicalPath: string
): Promise<void> {
  const info = await stat(from)
  const input = await open(from, 'r')
  const output = await open(to, 'w')

  try {
    const header = fileHeader(info.size, prefix)
    await writeAll(output, header, 0)
    let inputAt = 0
    let outputAt = header.byteLength
    let chunkIndex = 0
    const buffer = Buffer.allocUnsafe(Math.min(PROTECTED_CHUNK_BYTES, Math.max(info.size, 1)))

    while (inputAt < info.size) {
      const wanted = Math.min(buffer.byteLength, info.size - inputAt)
      const { bytesRead } = await input.read(buffer, 0, wanted, inputAt)
      if (bytesRead === 0) throw new Error(`Unexpected end of ${logicalPath}`)
      const encrypted = encryptChunk(
        buffer.subarray(0, bytesRead), key, prefix, keyId, logicalPath, info.size, chunkIndex
      )
      await writeAll(output, encrypted, outputAt)
      inputAt += bytesRead
      outputAt += encrypted.byteLength
      chunkIndex += 1
    }
  } finally {
    await Promise.all([input.close(), output.close()])
  }
}

async function encryptBytes(
  input: Buffer,
  to: string,
  key: Buffer,
  prefix: Buffer,
  keyId: string,
  logicalPath: string
): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  const chunks: Buffer[] = [fileHeader(input.byteLength, prefix)]
  for (let at = 0, index = 0; at < input.byteLength; at += PROTECTED_CHUNK_BYTES, index += 1) {
    chunks.push(encryptChunk(
      input.subarray(at, at + PROTECTED_CHUNK_BYTES),
      key,
      prefix,
      keyId,
      logicalPath,
      input.byteLength,
      index
    ))
  }
  await writeFile(to, Buffer.concat(chunks))
}

function encryptChunk(
  plain: Buffer,
  key: Buffer,
  prefix: Buffer,
  keyId: string,
  logicalPath: string,
  plainBytes: number,
  chunkIndex: number
): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, chunkIv(prefix, chunkIndex))
  cipher.setAAD(Buffer.from(protectedChunkAad(keyId, logicalPath, plainBytes, chunkIndex)), {
    plaintextLength: plain.byteLength
  })
  return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])
}

function fileHeader(plainBytes: number, prefix: Buffer): Buffer {
  const header = Buffer.alloc(PROTECTED_FILE_HEADER_BYTES)
  header.write(PROTECTED_FILE_MAGIC, 0, 'ascii')
  header.writeUInt8(PROTECTED_FILE_VERSION, 4)
  header.writeUInt32BE(PROTECTED_CHUNK_BYTES, 5)
  header.writeBigUInt64BE(BigInt(plainBytes), 9)
  prefix.copy(header, 17)
  return header
}

function chunkIv(prefix: Buffer, chunkIndex: number): Buffer {
  const iv = Buffer.allocUnsafe(12)
  prefix.copy(iv, 0)
  iv.writeUInt32BE(chunkIndex, 8)
  return iv
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, data: Buffer, position: number): Promise<void> {
  let written = 0
  while (written < data.byteLength) {
    const result = await handle.write(data, written, data.byteLength - written, position + written)
    if (result.bytesWritten === 0) throw new Error('Could not make progress writing a protected file.')
    written += result.bytesWritten
  }
}

async function optionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

function mimeFor(path: string): string {
  const extension = path.toLowerCase().split('.').pop()
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
    m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac'
  } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
}

/** Test and diagnostic counterpart of the browser reader. */
export function decryptProtectedBytes(
  encrypted: Uint8Array,
  key: Uint8Array,
  keyId: string,
  logicalPath: string
): Buffer {
  const input = Buffer.from(encrypted)
  if (input.byteLength < PROTECTED_FILE_HEADER_BYTES) throw new Error('Protected file is truncated.')
  if (input.toString('ascii', 0, 4) !== PROTECTED_FILE_MAGIC) throw new Error('Protected file has a bad signature.')
  if (input.readUInt8(4) !== PROTECTED_FILE_VERSION) throw new Error('Protected file version is unsupported.')
  const chunkBytes = input.readUInt32BE(5)
  const plainBytes = Number(input.readBigUInt64BE(9))
  const prefix = input.subarray(17, 25)
  const output: Buffer[] = []
  let encryptedAt = PROTECTED_FILE_HEADER_BYTES

  for (let plainAt = 0, index = 0; plainAt < plainBytes; plainAt += chunkBytes, index += 1) {
    const length = Math.min(chunkBytes, plainBytes - plainAt)
    const record = input.subarray(encryptedAt, encryptedAt + length + PROTECTED_GCM_TAG_BYTES)
    if (record.byteLength !== length + PROTECTED_GCM_TAG_BYTES) throw new Error('Protected file is truncated.')
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), chunkIv(prefix, index))
    decipher.setAAD(Buffer.from(protectedChunkAad(keyId, logicalPath, plainBytes, index)), {
      plaintextLength: length
    })
    decipher.setAuthTag(record.subarray(length))
    output.push(Buffer.concat([decipher.update(record.subarray(0, length)), decipher.final()]))
    encryptedAt += record.byteLength
  }
  if (encryptedAt !== input.byteLength) throw new Error('Protected file has trailing data.')
  return Buffer.concat(output)
}
