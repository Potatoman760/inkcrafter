import {
  PROTECTED_FILE_HEADER_BYTES,
  PROTECTED_FILE_MAGIC,
  PROTECTED_FILE_VERSION,
  PROTECTED_GCM_TAG_BYTES,
  protectedChunkAad,
  type ProtectedAssetFile,
  type ProtectedBundleHeader,
  type ProtectedBundlePayload,
} from "@/bundle/spec/bundle/protection";
import { releasePrivateKey } from "@/bundle/releaseKeys";

export async function unlockContentKey(header: ProtectedBundleHeader): Promise<CryptoKey> {
  const encoded = releasePrivateKey(header.protection.keyId);
  if (!encoded) {
    throw new Error(
      `This player was not built with release key ${header.protection.keyId}. ` +
      "Install the project's key from InkCrafter, then rebuild the player.",
    );
  }

  try {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      exactBuffer(base64(encoded)),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
    const raw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      exactBuffer(base64(header.protection.wrappedKey)),
    );
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  } catch {
    throw new Error(
      `Release key ${header.protection.keyId} could not unlock this bundle. ` +
      "Reinstall the matching key and rebuild the player.",
    );
  }
}

export async function decryptProtectedText(
  href: string,
  key: CryptoKey,
  keyId: string,
  logicalPath: string,
): Promise<string> {
  const chunks = await decryptProtectedChunks(href, key, keyId, logicalPath);
  const bytes = concatenate(chunks);
  return new TextDecoder().decode(bytes);
}

/** Lazily turns opaque protected media into browser-decodable Blob URLs. */
export class ProtectedAssetUrls {
  private readonly root: URL;
  private readonly key: CryptoKey;
  private readonly keyId: string;
  private readonly files: Map<string, ProtectedAssetFile>;
  private readonly urls = new Map<string, Promise<string>>();

  constructor(root: URL, key: CryptoKey, keyId: string, files: ProtectedAssetFile[]) {
    this.root = root;
    this.key = key;
    this.keyId = keyId;
    this.files = new Map(files.map((file) => [file.logicalPath, file]));
  }

  get cachedPaths(): string[] {
    return [...this.urls.keys()];
  }

  cached(path: string): string | null {
    // A Promise cannot be synchronously inspected. Callers use this only after
    // prepare() has completed, and fulfilled values are mirrored below.
    return this.resolved.get(path) ?? null;
  }

  private readonly resolved = new Map<string, string>();

  prepare(path: string): Promise<string> {
    const existing = this.urls.get(path);
    if (existing) return existing;
    const file = this.files.get(path);
    if (!file) return Promise.reject(new Error(`Protected asset ${path} is not in the bundle.`));

    const pending = decryptProtectedChunks(
      new URL(file.path, this.root).href,
      this.key,
      this.keyId,
      file.logicalPath,
    ).then((chunks) => {
      const url = URL.createObjectURL(new Blob(chunks.map(exactBuffer), { type: file.mime }));
      this.resolved.set(path, url);
      return url;
    }).catch((error: unknown) => {
      this.urls.delete(path);
      throw error;
    });
    this.urls.set(path, pending);
    return pending;
  }
}

export function parseProtectedPayload(text: string): ProtectedBundlePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The protected bundle metadata is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The protected bundle metadata is missing.");
  }
  const one = parsed as Partial<ProtectedBundlePayload>;
  if (!one.manifest || !one.documents || !Array.isArray(one.assets)) {
    throw new Error("The protected bundle metadata is incomplete.");
  }
  return one as ProtectedBundlePayload;
}

async function decryptProtectedChunks(
  href: string,
  key: CryptoKey,
  keyId: string,
  logicalPath: string,
): Promise<Uint8Array[]> {
  const response = await fetch(href);
  if (!response.ok) throw new Error(`Could not load protected file ${href} (${response.status}).`);
  const reader = new ExactReader(responseBytes(response), logicalPath);
  const header = await reader.read(PROTECTED_FILE_HEADER_BYTES);
  if (new TextDecoder().decode(header.subarray(0, 4)) !== PROTECTED_FILE_MAGIC) {
    throw new Error(`Protected file ${logicalPath} has a bad signature.`);
  }

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint8(4) !== PROTECTED_FILE_VERSION) {
    throw new Error(`Protected file ${logicalPath} uses an unsupported version.`);
  }
  const chunkBytes = view.getUint32(5);
  const plainBytes = Number(view.getBigUint64(9));
  if (!Number.isSafeInteger(plainBytes) || chunkBytes <= 0) {
    throw new Error(`Protected file ${logicalPath} has an invalid header.`);
  }
  const prefix = header.slice(17, 25);
  const chunks: Uint8Array[] = [];

  for (let plainAt = 0, index = 0; plainAt < plainBytes; plainAt += chunkBytes, index += 1) {
    const length = Math.min(chunkBytes, plainBytes - plainAt);
    const recordLength = length + PROTECTED_GCM_TAG_BYTES;
    // Only one encrypted record is resident while WebCrypto authenticates it.
    // The decrypted buffers are retained as the eventual Blob without first
    // holding a second, full-size ciphertext copy of a large video.
    const record = await reader.read(recordLength);

    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: exactBuffer(chunkIv(prefix, index)),
          additionalData: new TextEncoder().encode(
            protectedChunkAad(keyId, logicalPath, plainBytes, index),
          ),
          tagLength: 128,
        },
        key,
        exactBuffer(record),
      );
      chunks.push(new Uint8Array(decrypted));
    } catch {
      throw new Error(`Protected file ${logicalPath} is damaged or belongs to another release key.`);
    }
  }

  if (await reader.hasMore()) {
    throw new Error(`Protected file ${logicalPath} has unexpected trailing data.`);
  }
  return chunks;
}

async function* responseBytes(response: Response): AsyncGenerator<Uint8Array> {
  if (!response.body) {
    yield new Uint8Array(await response.arrayBuffer());
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      if (next.value.byteLength > 0) yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Pulls exact records from an arbitrarily segmented fetch response. */
class ExactReader {
  private readonly source: AsyncIterator<Uint8Array>;
  private current: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private at = 0;
  private ended = false;

  constructor(source: AsyncIterable<Uint8Array>, private readonly logicalPath: string) {
    this.source = source[Symbol.asyncIterator]();
  }

  async read(length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (this.at === this.current.byteLength) {
        const next = await this.source.next();
        if (next.done) {
          this.ended = true;
          throw new Error(`Protected file ${this.logicalPath} is truncated.`);
        }
        this.current = next.value;
        this.at = 0;
      }
      const amount = Math.min(length - written, this.current.byteLength - this.at);
      result.set(this.current.subarray(this.at, this.at + amount), written);
      this.at += amount;
      written += amount;
    }
    return result;
  }

  async hasMore(): Promise<boolean> {
    if (this.at < this.current.byteLength) return true;
    if (this.ended) return false;
    const next = await this.source.next();
    this.ended = next.done === true;
    return !next.done;
  }
}

function chunkIv(prefix: Uint8Array, index: number): Uint8Array {
  const iv = new Uint8Array(12);
  iv.set(prefix);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}

function base64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.byteLength;
  }
  return result;
}
