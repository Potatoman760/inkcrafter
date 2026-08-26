import { open } from 'node:fs/promises'

/**
 * How big a picture is, without decoding it.
 *
 * Every image format writes its dimensions near the front, so a few dozen bytes
 * answer a question that would otherwise need a decoder — and the export asks it
 * of every hotspot look, to catch the one that is a different size from its
 * siblings and would be stretched into their box.
 *
 * Unknown formats return null rather than throwing. A size that cannot be read
 * is a check that cannot run, which is not the same as a problem to report.
 */

export interface ImageSize {
  width: number
  height: number
}

/** Enough for a PNG header, a GIF header, and a good many JPEG segments. */
const HEAD_BYTES = 64 * 1024

export async function imageSize(path: string): Promise<ImageSize | null> {
  let head: Buffer
  try {
    const file = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(HEAD_BYTES)
      const { bytesRead } = await file.read(buffer, 0, HEAD_BYTES, 0)
      head = buffer.subarray(0, bytesRead)
    } finally {
      await file.close()
    }
  } catch {
    return null
  }

  return pngSize(head) ?? gifSize(head) ?? jpegSize(head) ?? webpSize(head)
}

/** `\x89PNG`, then an IHDR whose first two fields are the dimensions. */
function pngSize(head: Buffer): ImageSize | null {
  if (head.length < 24) return null
  if (head.readUInt32BE(0) !== 0x89504e47) return null
  if (head.toString('ascii', 12, 16) !== 'IHDR') return null

  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

/** `GIF87a`/`GIF89a`, then two little-endian shorts. */
function gifSize(head: Buffer): ImageSize | null {
  if (head.length < 10) return null
  if (head.toString('ascii', 0, 3) !== 'GIF') return null

  return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) }
}

/**
 * JPEG keeps its size in a start-of-frame segment, which sits after however
 * many other segments the encoder felt like writing — so the segments are
 * walked rather than assumed.
 */
function jpegSize(head: Buffer): ImageSize | null {
  if (head.length < 4 || head.readUInt16BE(0) !== 0xffd8) return null

  let at = 2
  while (at + 9 < head.length) {
    if (head[at] !== 0xff) {
      at++
      continue
    }

    const marker = head[at + 1]!
    // SOF0-SOF15, except the four that are not frames at all.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: head.readUInt16BE(at + 5), width: head.readUInt16BE(at + 7) }
    }

    // Markers without a payload, which have no length to skip by.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2
      continue
    }

    at += 2 + head.readUInt16BE(at + 2)
  }

  return null
}

/** RIFF/WEBP, in whichever of its three chunk shapes. */
function webpSize(head: Buffer): ImageSize | null {
  if (head.length < 30) return null
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }

  const chunk = head.toString('ascii', 12, 16)

  if (chunk === 'VP8 ') {
    return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff }
  }

  if (chunk === 'VP8L') {
    const bits = head.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }

  if (chunk === 'VP8X') {
    const read24 = (at: number): number =>
      head[at]! | (head[at + 1]! << 8) | (head[at + 2]! << 16)
    return { width: read24(24) + 1, height: read24(27) + 1 }
  }

  return null
}
