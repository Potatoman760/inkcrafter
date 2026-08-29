import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { imageSize } from './imageSize'

/**
 * Reading a picture's size from its first few bytes.
 *
 * Used to catch a hotspot look that is a different size from its siblings and
 * would be stretched into their box. Every case here is a header built by hand,
 * because the point is the parsing rather than any particular picture.
 */

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-size-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function file(name: string, bytes: Buffer): Promise<string> {
  const path = join(root, name)
  await writeFile(path, bytes)
  return path
}

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  buffer.writeUInt32BE(0x89504e47, 0)
  buffer.writeUInt32BE(0x0d0a1a0a, 4)
  buffer.writeUInt32BE(13, 8)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

describe('imageSize', () => {
  it('reads a PNG', async () => {
    expect(await imageSize(await file('a.png', png(400, 200)))).toEqual({
      width: 400,
      height: 200
    })
  })

  it('reads a GIF', async () => {
    const buffer = Buffer.alloc(10)
    buffer.write('GIF89a', 0, 'ascii')
    buffer.writeUInt16LE(320, 6)
    buffer.writeUInt16LE(240, 8)

    expect(await imageSize(await file('a.gif', buffer))).toEqual({ width: 320, height: 240 })
  })

  it('walks a JPEG past the segments in front of the frame', async () => {
    // SOI, then a JFIF segment nothing wants, then the frame that has the size.
    const parts = [
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x10]),
      Buffer.alloc(14),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),
      (() => {
        const size = Buffer.alloc(4)
        size.writeUInt16BE(180, 0)
        size.writeUInt16BE(240, 2)
        return size
      })(),
      Buffer.alloc(8)
    ]

    expect(await imageSize(await file('a.jpg', Buffer.concat(parts)))).toEqual({
      width: 240,
      height: 180
    })
  })

  it('reads a lossy WEBP', async () => {
    const buffer = Buffer.alloc(30)
    buffer.write('RIFF', 0, 'ascii')
    buffer.write('WEBP', 8, 'ascii')
    buffer.write('VP8 ', 12, 'ascii')
    buffer.writeUInt16LE(300, 26)
    buffer.writeUInt16LE(150, 28)

    expect(await imageSize(await file('a.webp', buffer))).toEqual({ width: 300, height: 150 })
  })

  it('says nothing about a format it does not know', async () => {
    // A check that cannot run is not the same as a problem to report.
    expect(await imageSize(await file('a.bin', Buffer.from('not a picture')))).toBeNull()
  })

  it('says nothing about a file that is not there', async () => {
    expect(await imageSize(join(root, 'nowhere.png'))).toBeNull()
  })

  it('says nothing about a truncated header rather than reading past it', async () => {
    expect(await imageSize(await file('short.png', png(400, 200).subarray(0, 12)))).toBeNull()
  })
})
