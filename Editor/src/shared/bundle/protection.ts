import type { BundleManifest } from './manifest'

/** A protected bundle is still identified by manifest.json, but nothing useful sits beside it. */
export const PROTECTED_BUNDLE_FORMAT = 2 as const
export const PROTECTION_SCHEME = 'rsa-oaep-sha256+aes-256-gcm-chunks-v1' as const
export const PROTECTED_CONTENT_DIR = 'content'

/** Four MiB keeps a 300 MB clip seekable without producing hundreds of tiny records. */
export const PROTECTED_CHUNK_BYTES = 4 * 1024 * 1024
export const PROTECTED_FILE_MAGIC = 'ICPF'
export const PROTECTED_FILE_VERSION = 1
export const PROTECTED_FILE_HEADER_BYTES = 25
export const PROTECTED_GCM_TAG_BYTES = 16

export interface ProtectedFileRef {
  /** Opaque bundle-relative path. Original names live only inside the encrypted payload. */
  path: string
  plainBytes: number
}

/** The only plaintext document in a protected export. */
export interface ProtectedBundleHeader {
  format: typeof PROTECTED_BUNDLE_FORMAT
  generatedBy: 'InkCrafter'
  generatedAt: string
  protection: {
    scheme: typeof PROTECTION_SCHEME
    /** SHA-256 fingerprint prefix of the release public key. */
    keyId: string
    /** One-export AES-256 key, wrapped with the release RSA public key. */
    wrappedKey: string
    payload: ProtectedFileRef
  }
}

export interface ProtectedAssetFile extends ProtectedFileRef {
  /** The path the logical manifest names, authenticated into every encrypted chunk. */
  logicalPath: string
  /** Passed to Blob so browser decoders do not have to guess from an opaque .icp name. */
  mime: string
}

/** Everything a plain bundle exposes, recovered after the release key has been accepted. */
export interface ProtectedBundlePayload {
  manifest: BundleManifest
  documents: {
    story: string
    catalogue: string
    media: string
    npcs: string
    map: string
    gallery: string
    /** Optional so protected bundles exported before achievements still load. */
    achievements?: string
    /** Optional so protected bundles exported before minigames still load. */
    minigames?: string
    preview: string | null
  }
  assets: ProtectedAssetFile[]
}

export function parseProtectedHeader(value: unknown): ProtectedBundleHeader | null {
  if (typeof value !== 'object' || value === null) return null
  const one = value as Record<string, unknown>
  const protection = one['protection']
  if (typeof protection !== 'object' || protection === null) return null
  const protectedRecord = protection as Record<string, unknown>
  const payload = protectedRecord['payload']
  if (typeof payload !== 'object' || payload === null) return null
  const payloadRecord = payload as Record<string, unknown>

  if (
    one['format'] !== PROTECTED_BUNDLE_FORMAT ||
    one['generatedBy'] !== 'InkCrafter' ||
    typeof one['generatedAt'] !== 'string' ||
    protectedRecord['scheme'] !== PROTECTION_SCHEME ||
    typeof protectedRecord['keyId'] !== 'string' ||
    typeof protectedRecord['wrappedKey'] !== 'string' ||
    typeof payloadRecord['path'] !== 'string' ||
    typeof payloadRecord['plainBytes'] !== 'number'
  ) return null

  return value as ProtectedBundleHeader
}

/** Additional authenticated data: moving a valid chunk to another file must fail closed. */
export function protectedChunkAad(
  keyId: string,
  logicalPath: string,
  plainBytes: number,
  chunkIndex: number
): string {
  return [PROTECTED_FILE_VERSION, keyId, logicalPath, plainBytes, chunkIndex].join('\u0000')
}
