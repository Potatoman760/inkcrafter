import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { deflateSync } from 'node:zlib'
import { generateImage } from './run'
import type { Watcher } from './progress'

/**
 * The client against a real server, over a real socket.
 *
 * `run.test.ts` stubs fetch, which tests the state machine but not the HTTP:
 * whether the body is shaped the way ComfyUI wants, whether a 400 is read back
 * correctly, whether the bytes survive the stream. Those are exactly the things
 * that only fail against something actually listening.
 *
 * The server here answers the way ComfyUI does — `/prompt` takes a graph and
 * returns a job id, `/history` is empty until it is not, `/view` streams the
 * file — so everything from `submitPrompt` outwards is the real code.
 */

/** A real 1×1 PNG, built rather than pasted so it is honestly well-formed. */
function png(): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })

  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'ascii')

    let crc = 0xffffffff
    for (const byte of Buffer.concat([Buffer.from(type, 'ascii'), body])) {
      crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
    }
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0)

    return Buffer.concat([head, body, tail])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0]))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const PICTURE = png()
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let server: Server
let baseUrl = ''
let submitted: unknown = null
let askedFor: string | null = null
/** How many `/history` polls before the job is reported done. */
let pollsUntilDone = 1
let refuse = false

beforeEach(async () => {
  submitted = null
  askedFor = null
  pollsUntilDone = 1
  refuse = false
  let polls = 0

  const DONE = {
    'job-1': {
      outputs: { '9': { images: [{ filename: 'ComfyUI_00042_.png', subfolder: '', type: 'output' }] } },
      status: { status_str: 'success', completed: true }
    }
  }

  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const json = (body: unknown, status = 200): void => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }

    if (url.pathname === '/prompt') {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        submitted = JSON.parse(Buffer.concat(chunks).toString('utf8'))

        if (refuse) {
          json(
            {
              error: { type: 'prompt_outputs_failed_validation' },
              node_errors: {
                '4': {
                  class_type: 'CheckpointLoaderSimple',
                  errors: [{ message: 'Value not in list: ckpt_name', details: 'gone.safetensors' }]
                }
              }
            },
            400
          )
          return
        }

        json({ prompt_id: 'job-1', number: 1, node_errors: {} })
      })
      return
    }

    if (url.pathname.startsWith('/history/')) {
      polls++
      json(polls >= pollsUntilDone ? DONE : {})
      return
    }

    if (url.pathname === '/queue') {
      json({ queue_running: [[0, 'job-1']], queue_pending: [] })
      return
    }

    if (url.pathname === '/view') {
      askedFor = url.searchParams.get('filename')
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': String(PICTURE.length)
      })
      response.end(PICTURE)
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const silent: Watcher = () => () => {}

const WORKFLOW = {
  '3': { class_type: 'KSampler', inputs: { seed: 7, positive: ['6', 0] } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'a harbour at dusk' } },
  '9': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
}

const draw = (overrides: Partial<Parameters<typeof generateImage>[0]> = {}) =>
  generateImage({
    baseUrl,
    prompt: WORKFLOW,
    outputNode: '9',
    timeoutMs: 10_000,
    watch: silent,
    pollMs: { running: 5, queued: 5 },
    ...overrides
  })

describe('against a server that is really listening', () => {
  it('queues the graph, waits for it, and brings back the bytes', async () => {
    const result = await draw()

    expect(result.ok).toBe(true)
    expect(result.filename).toBe('ComfyUI_00042_.png')
    expect(askedFor).toBe('ComfyUI_00042_.png')
    // Byte for byte, through the stream and the size cap.
    expect(result.bytes).toEqual(PICTURE)
    expect(result.bytes!.subarray(0, 8)).toEqual(SIGNATURE)
  })

  it('sends the graph in the envelope ComfyUI expects', async () => {
    await draw()

    // Not the graph at the top level — it goes under `prompt`, beside a client
    // id, and getting that wrong is a 400 with nothing useful in it.
    const body = submitted as { prompt: Record<string, unknown>; client_id: string }
    expect(body.prompt).toEqual(WORKFLOW)
    expect(typeof body.client_id).toBe('string')
    expect(body.client_id.length).toBeGreaterThan(0)
  })

  it('keeps polling while the job is still going', async () => {
    pollsUntilDone = 4
    const notes: string[] = []

    const result = await draw({ onProgress: (note) => notes.push(note) })

    expect(result.ok).toBe(true)
    expect(notes).toContain('ComfyUI is working…')
  })

  it('reads a real 400 back into a sentence naming the node', async () => {
    refuse = true
    const result = await draw()

    expect(result.ok).toBe(false)
    expect(result.message).toContain('CheckpointLoaderSimple #4')
    expect(result.message).toContain('gone.safetensors')
  })

  it('says ComfyUI is not running when nothing is listening', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))

    const result = await draw()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Is ComfyUI running\?/)
  })
})
