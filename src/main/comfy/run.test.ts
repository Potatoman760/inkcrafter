import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateImage } from './run'
import type { Watcher } from './progress'

/**
 * A generation, and the several ways it can go wrong.
 *
 * Every one of these is a failure the author will actually see: a renamed
 * checkpoint, ComfyUI not running, a workflow with no save node, a card that
 * has gone away mid-run. What matters in each case is that a sentence comes
 * back rather than a stack trace or a hang — the tool is inside a chat turn
 * that awaits it, so anything that does not return takes the window with it.
 */

const BASE = 'http://127.0.0.1:8188'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const WORKFLOW = { '3': { class_type: 'KSampler', inputs: { seed: 1 } } }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const DONE = {
  'job-1': {
    outputs: { '9': { images: [{ filename: 'ComfyUI_00001_.png', subfolder: '', type: 'output' }] } },
    status: { status_str: 'success', completed: true }
  }
}

interface Server {
  prompt?: Response | (() => Response)
  /** Answered in order; the last one repeats once the list runs out. */
  history?: unknown[]
  queue?: unknown
  view?: Response
}

/** A stubbed ComfyUI that answers by endpoint rather than by call order. */
function serve(options: Server): { calls: string[]; fetch: ReturnType<typeof vi.fn> } {
  const calls: string[] = []
  let historyAt = 0

  const mock = vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url.slice(BASE.length).split('?')[0]}`)

    if (url.includes('/prompt')) {
      const reply = options.prompt ?? json({ prompt_id: 'job-1' })
      return typeof reply === 'function' ? reply() : reply.clone()
    }
    if (url.includes('/history/')) {
      const list = options.history ?? [DONE]
      const body = list[Math.min(historyAt++, list.length - 1)]
      return json(body)
    }
    if (url.includes('/queue')) {
      return json(options.queue ?? { queue_running: [], queue_pending: [] })
    }
    if (url.includes('/view')) {
      return (options.view ?? new Response(PNG)).clone()
    }
    if (url.includes('/interrupt')) return new Response(null, { status: 200 })

    throw new Error(`unexpected ${url}`)
  })

  vi.stubGlobal('fetch', mock)
  return { calls, fetch: mock }
}

const silent: Watcher = () => () => {}

function run(overrides: Partial<Parameters<typeof generateImage>[0]> = {}) {
  return generateImage({
    baseUrl: BASE,
    prompt: WORKFLOW,
    outputNode: '9',
    timeoutMs: 5_000,
    watch: silent,
    pollMs: { running: 1, queued: 2 },
    ...overrides
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateImage', () => {
  it('queues, waits, and comes back with the picture', async () => {
    const { calls } = serve({ history: [{}, {}, DONE] })
    const notes: string[] = []

    const result = await run({ onProgress: (note) => notes.push(note) })

    expect(result.ok).toBe(true)
    expect(result.bytes).toEqual(PNG)
    expect(result.filename).toBe('ComfyUI_00001_.png')
    expect(calls.filter((one) => one.includes('/history'))).toHaveLength(3)
    expect(notes[0]).toMatch(/asking ComfyUI/)
    expect(notes.at(-1)).toMatch(/fetching the picture/)
  })

  it('names the node and the reason when ComfyUI refuses the workflow', async () => {
    serve({
      prompt: json(
        {
          error: { type: 'prompt_outputs_failed_validation' },
          node_errors: {
            '4': {
              class_type: 'CheckpointLoaderSimple',
              errors: [{ message: 'Value not in list: ckpt_name', details: "'sdxl.safetensors' not in [...]" }]
            }
          }
        },
        400
      )
    })

    const result = await run()
    expect(result.ok).toBe(false)
    expect(result.message).toContain('CheckpointLoaderSimple #4')
    expect(result.message).toContain('Value not in list')
  })

  it('says ComfyUI is not running rather than reporting an errno', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: new Error('connect ECONNREFUSED 127.0.0.1:8188')
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(refused))

    const result = await run()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Is ComfyUI running\?/)
  })

  it('gives up on its own deadline, cancels the job, and returns', async () => {
    // History never completes — the shape of a ComfyUI that has stopped
    // answering, or a card that has fallen over mid-run.
    const { calls } = serve({ history: [{}] })

    const result = await run({ timeoutMs: 60 })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/did not finish within/)
    expect(result.bytes).toBeNull()
    // It must not leave the job sitting in the queue holding the card.
    expect(calls).toContain('POST /interrupt')
    expect(calls).toContain('POST /queue')
  })

  it('reports a workflow that ran but saved nothing', async () => {
    serve({ history: [{ 'job-1': { outputs: {}, status: { status_str: 'success', completed: true } } }] })

    const result = await run()
    expect(result.message).toMatch(/no SaveImage node/)
  })

  it('passes on what ComfyUI said when the run itself failed', async () => {
    serve({
      history: [
        {
          'job-1': {
            outputs: {},
            status: {
              status_str: 'error',
              completed: false,
              messages: [
                ['execution_error', { node_type: 'KSampler', exception_message: 'CUDA out of memory' }]
              ]
            }
          }
        }
      ]
    })

    const result = await run()
    expect(result.message).toContain('KSampler')
    expect(result.message).toContain('CUDA out of memory')
  })

  it('turns the socket’s events into notes as they arrive', async () => {
    serve({ history: [{}, DONE] })
    const notes: string[] = []

    const watch: Watcher = (_base, _client, on) => {
      on({ kind: 'progress', value: 4, max: 20 })
      on({ kind: 'progress', value: 12, max: 20 })
      on({ kind: 'executing', node: '3' })
      return () => {}
    }

    await run({ watch, onProgress: (note) => notes.push(note) })

    expect(notes).toContain('step 4 of 20')
    expect(notes).toContain('step 12 of 20')
    expect(notes.indexOf('step 4 of 20')).toBeLessThan(notes.indexOf('step 12 of 20'))
  })

  it('finishes normally when the socket cannot be opened at all', async () => {
    serve({})
    const broken: Watcher = () => {
      throw new Error('no socket here')
    }

    // The websocket narrates; it never decides.
    const result = await run({ watch: broken })
    expect(result.ok).toBe(true)
  })

  it('says how many jobs are ahead, once', async () => {
    // Someone else's job is running and ours is first in the queue behind it,
    // which is one job ahead of us.
    const { calls } = serve({
      history: [{}, {}, DONE],
      queue: { queue_running: [[0, 'someone-else']], queue_pending: [[0, 'job-1']] }
    })
    const notes: string[] = []

    await run({ onProgress: (note) => notes.push(note) })

    expect(notes).toContain('queued — 1 job ahead')
    // Repeating it every poll would bury the step counts coming from the socket.
    expect(notes.filter((one) => one.startsWith('queued'))).toHaveLength(1)
    expect(calls.filter((one) => one.includes('/queue'))).toHaveLength(2)
  })

  it('refuses a picture too large to be one', async () => {
    serve({ view: new Response(PNG, { headers: { 'content-length': String(64 * 1024 * 1024) } }) })

    const result = await run()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/more than the app will accept/)
  })

  it('collects from the bound node when several produced pictures', async () => {
    serve({
      history: [
        {
          'job-1': {
            outputs: {
              '8': { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] },
              '9': { images: [{ filename: 'saved.png', subfolder: 'bg', type: 'output' }] }
            },
            status: { status_str: 'success', completed: true }
          }
        }
      ]
    })

    const result = await run({ outputNode: '9' })
    expect(result.filename).toBe('saved.png')
  })

  it('takes any picture rather than none when the bound node is wrong', async () => {
    serve({
      history: [
        {
          'job-1': {
            outputs: { '8': { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] } },
            status: { status_str: 'success', completed: true }
          }
        }
      ]
    })

    // A stale output binding should degrade, not fail — the pictures are there.
    const result = await run({ outputNode: '99' })
    expect(result.ok).toBe(true)
    expect(result.filename).toBe('preview.png')
  })
})
