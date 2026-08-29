import { randomUUID } from 'node:crypto'
import type { ComfyTestResult } from '@shared/comfy'

/**
 * Talking to ComfyUI. One function per endpoint, and nothing else.
 *
 * Kept apart from `run.ts` so the state machine up there can be tested against
 * a stubbed fetch without any of this, and so the endpoints stay readable as
 * the small, well-documented set they are.
 *
 * Nothing here throws for an ordinary failure. A refused connection is a fact
 * about the author's machine, not an exception — it belongs in a sentence they
 * can act on, and every caller wants it that way.
 */

/**
 * One id for the life of the app.
 *
 * ComfyUI uses it to route the websocket's events back to whoever queued the
 * job, so the socket and the submission have to agree on it.
 */
const CLIENT_ID = randomUUID()

export function comfyClientId(): string {
  return CLIENT_ID
}

/** Where the progress socket lives, derived from wherever the API is. */
export function comfyWsUrl(baseUrl: string, clientId: string): string {
  const scheme = baseUrl.startsWith('https:') ? 'wss:' : 'ws:'
  return `${baseUrl.replace(/^https?:/, scheme)}/ws?clientId=${encodeURIComponent(clientId)}`
}

/**
 * A picture ComfyUI has made and is holding for us.
 *
 * These three strings come from a remote service and are used *only* as query
 * parameters below. Nothing here is ever joined to a local path — the file the
 * app writes is named by the app.
 */
export interface ComfyImageRef {
  filename: string
  subfolder: string
  type: string
}

/** Bigger than any picture a workflow should produce, small enough to survive. */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024

function describe(cause: unknown, baseUrl: string): string {
  if (cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')) {
    return `${baseUrl} did not answer in time.`
  }

  const raw = cause instanceof Error ? cause.message : String(cause)
  // Node buries the useful part — "fetch failed" with the cause underneath.
  const inner = cause instanceof Error && cause.cause instanceof Error ? cause.cause.message : ''
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/.test(`${raw} ${inner}`)) {
    return `Nothing is answering at ${baseUrl}. Is ComfyUI running?`
  }

  return `${baseUrl}: ${inner || raw}`
}

/**
 * Whether ComfyUI is there, and enough about it to prove it is the right one.
 *
 * `/system_stats` needs no authentication and no workflow, which makes it the
 * cheapest honest answer to "is this the address".
 */
export async function testComfy(baseUrl: string): Promise<ComfyTestResult> {
  try {
    const response = await fetch(`${baseUrl}/system_stats`, {
      signal: AbortSignal.timeout(8_000)
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200).trim()
      return {
        ok: false,
        status: response.status,
        message: detail || `${response.status} ${response.statusText}`,
        device: null
      }
    }

    const body = (await response.json()) as {
      system?: { comfyui_version?: unknown }
      devices?: { name?: unknown; vram_total?: unknown }[]
    }

    return { ok: true, status: response.status, message: 'ComfyUI answered.', device: describeDevice(body) }
  } catch (cause) {
    return { ok: false, status: null, message: describe(cause, baseUrl), device: null }
  }
}

/** "ComfyUI 0.3.68 · NVIDIA GeForce RTX 4090 · 24.0 GB", as far as it said. */
function describeDevice(body: {
  system?: { comfyui_version?: unknown }
  devices?: { name?: unknown; vram_total?: unknown }[]
}): string | null {
  const parts: string[] = []

  const version = body.system?.comfyui_version
  if (typeof version === 'string') parts.push(`ComfyUI ${version}`)

  const device = body.devices?.[0]
  if (device && typeof device.name === 'string') {
    // "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync" — the allocator and
    // the device index are noise to someone checking they typed the right host.
    parts.push(device.name.replace(/^\w+:\d+\s+/, '').replace(/\s*:\s*\w*[Mm]alloc\w*$/, ''))
  }
  if (device && typeof device.vram_total === 'number' && device.vram_total > 0) {
    parts.push(`${(device.vram_total / 1024 ** 3).toFixed(1)} GB`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export interface SubmitResult {
  ok: boolean
  promptId: string | null
  message: string
}

/**
 * Queues a workflow.
 *
 * A 400 here is the most informative failure in the whole feature: ComfyUI
 * validates the graph and says exactly which node and which input it did not
 * like, which is usually a checkpoint filename that has been renamed.
 */
export async function submitPrompt(
  baseUrl: string,
  prompt: Record<string, unknown>,
  signal: AbortSignal
): Promise<SubmitResult> {
  try {
    const response = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: CLIENT_ID }),
      signal
    })

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      return { ok: false, promptId: null, message: describeRefusal(body, response.status) }
    }

    const promptId = (body as { prompt_id?: unknown } | null)?.prompt_id
    if (typeof promptId !== 'string' || promptId.length === 0) {
      return { ok: false, promptId: null, message: 'ComfyUI accepted the workflow but did not say which job it is.' }
    }

    return { ok: true, promptId, message: '' }
  } catch (cause) {
    return { ok: false, promptId: null, message: describe(cause, baseUrl) }
  }
}

function describeRefusal(body: unknown, status: number): string {
  const record = body as { error?: unknown; node_errors?: unknown } | null

  const reasons: string[] = []
  const errors = record?.node_errors
  if (typeof errors === 'object' && errors !== null) {
    for (const [id, value] of Object.entries(errors as Record<string, unknown>)) {
      const detail = value as { class_type?: unknown; errors?: { message?: unknown; details?: unknown }[] }
      const type = typeof detail.class_type === 'string' ? detail.class_type : 'node'
      for (const one of detail.errors ?? []) {
        const message = typeof one.message === 'string' ? one.message : 'was refused'
        const extra = typeof one.details === 'string' && one.details.length > 0 ? ` (${one.details})` : ''
        reasons.push(`${type} #${id} — ${message}${extra}`)
      }
    }
  }

  if (reasons.length > 0) return `ComfyUI refused the workflow: ${reasons.slice(0, 4).join('; ')}.`

  const error = record?.error
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return `ComfyUI refused the workflow: ${message}`
  }
  if (typeof error === 'string') return `ComfyUI refused the workflow: ${error}`

  return `ComfyUI refused the workflow (${status}).`
}

export interface HistoryOutcome {
  /** Absent until the job has finished one way or the other. */
  done: boolean
  images: ComfyImageRef[]
  /** Set when ComfyUI reported the run itself failed. */
  error: string | null
}

/**
 * How a job went, or nothing if it is still going.
 *
 * This is the only thing that decides a run is over. The websocket is livelier
 * and reports more, but it also drops, reconnects and misses events — so it
 * decorates and this decides, and the two can never disagree.
 */
export async function readHistory(
  baseUrl: string,
  promptId: string,
  outputNode: string | null,
  signal: AbortSignal
): Promise<HistoryOutcome> {
  const idle: HistoryOutcome = { done: false, images: [], error: null }

  let body: unknown
  try {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { signal })
    if (!response.ok) return idle
    body = await response.json()
  } catch {
    // A dropped poll is not a failed job. The deadline in run.ts is what ends
    // a run that never comes back.
    return idle
  }

  const entry = (body as Record<string, unknown> | null)?.[promptId]
  if (typeof entry !== 'object' || entry === null) return idle

  const record = entry as { outputs?: unknown; status?: unknown }
  const status = record.status as { status_str?: unknown; completed?: unknown; messages?: unknown } | undefined

  const images = collectImages(record.outputs, outputNode)
  const failed = status?.status_str === 'error'

  if (!failed && images.length === 0 && status?.completed !== true) return idle

  return {
    done: true,
    images,
    error: failed ? executionError(status?.messages) : null
  }
}

/** Prefers the bound node, but takes any pictures rather than none. */
function collectImages(outputs: unknown, outputNode: string | null): ComfyImageRef[] {
  if (typeof outputs !== 'object' || outputs === null) return []
  const record = outputs as Record<string, unknown>

  const from = (value: unknown): ComfyImageRef[] => {
    const images = (value as { images?: unknown } | null)?.images
    if (!Array.isArray(images)) return []
    return images
      .filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null)
      .filter((one) => typeof one['filename'] === 'string')
      .map((one) => ({
        filename: one['filename'] as string,
        subfolder: typeof one['subfolder'] === 'string' ? one['subfolder'] : '',
        type: typeof one['type'] === 'string' ? one['type'] : 'output'
      }))
  }

  if (outputNode !== null) {
    const preferred = from(record[outputNode])
    if (preferred.length > 0) return preferred
  }

  // A wrong binding degrades to "any picture this run made" rather than none.
  return Object.values(record).flatMap(from)
}

function executionError(messages: unknown): string {
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!Array.isArray(message) || message[0] !== 'execution_error') continue
      const detail = message[1] as { exception_message?: unknown; node_type?: unknown } | undefined
      const text = detail?.exception_message
      if (typeof text === 'string') {
        const where = typeof detail?.node_type === 'string' ? ` in ${detail.node_type}` : ''
        return `ComfyUI failed to run the workflow${where}: ${text}`
      }
    }
  }
  return 'ComfyUI failed to run the workflow.'
}

/** How many jobs are ahead of ours, so the wait can say something true. */
export async function queueDepth(
  baseUrl: string,
  promptId: string,
  signal: AbortSignal
): Promise<{ running: boolean; ahead: number } | null> {
  try {
    const response = await fetch(`${baseUrl}/queue`, { signal })
    if (!response.ok) return null

    const body = (await response.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] }
    const idOf = (item: unknown): string => (Array.isArray(item) && typeof item[1] === 'string' ? item[1] : '')

    const running = (body.queue_running ?? []).some((item) => idOf(item) === promptId)
    const pending = body.queue_pending ?? []
    const at = pending.findIndex((item) => idOf(item) === promptId)

    return { running, ahead: at === -1 ? 0 : at + (body.queue_running ?? []).length }
  } catch {
    return null
  }
}

export interface UploadResult {
  ok: boolean
  /** What LoadImage should be set to, subfolder included. */
  name: string | null
  message: string
}

/**
 * Puts a picture where ComfyUI can load it.
 *
 * `LoadImage` holds a file *name*, resolved inside ComfyUI's own input folder —
 * not a path — so a picture from the project cannot simply be pointed at. It
 * has to be handed over first, which is what this endpoint is for, and which is
 * also what makes the feature work when ComfyUI is on another machine.
 *
 * Overwrites by name on purpose: the same source picture edited five times
 * should be uploaded once, not five times under five names, and the name is
 * derived from the project's own path for it.
 */
export async function uploadImage(
  baseUrl: string,
  bytes: Buffer,
  filename: string,
  signal: AbortSignal
): Promise<UploadResult> {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), filename)
  form.append('type', 'input')
  form.append('overwrite', 'true')
  form.append('subfolder', 'inkcrafter')

  try {
    const response = await fetch(`${baseUrl}/upload/image`, { method: 'POST', body: form, signal })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200).trim()
      return {
        ok: false,
        name: null,
        message: `ComfyUI would not take the picture (${response.status}${detail ? `: ${detail}` : ''}).`
      }
    }

    const body = (await response.json()) as { name?: unknown; subfolder?: unknown }
    if (typeof body.name !== 'string' || body.name.length === 0) {
      return { ok: false, name: null, message: 'ComfyUI took the picture but did not say what it called it.' }
    }

    const subfolder = typeof body.subfolder === 'string' ? body.subfolder : ''
    return { ok: true, name: subfolder ? `${subfolder}/${body.name}` : body.name, message: '' }
  } catch (cause) {
    return { ok: false, name: null, message: describe(cause, baseUrl) }
  }
}

export interface ImageResult {
  ok: boolean
  bytes: Buffer | null
  message: string
}

/** Fetches one picture, refusing anything implausibly large. */
export async function fetchImage(
  baseUrl: string,
  ref: ComfyImageRef,
  signal: AbortSignal
): Promise<ImageResult> {
  const query = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type
  })

  try {
    const response = await fetch(`${baseUrl}/view?${query.toString()}`, { signal })
    if (!response.ok) {
      return { ok: false, bytes: null, message: `Could not fetch the picture (${response.status}).` }
    }

    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      return { ok: false, bytes: null, message: `That picture is ${Math.round(declared / 1024 / 1024)} MB, which is more than the app will accept.` }
    }

    const bytes = await readCapped(response, MAX_IMAGE_BYTES)
    if (!bytes) {
      return { ok: false, bytes: null, message: 'That picture is larger than the app will accept.' }
    }

    return { ok: true, bytes, message: '' }
  } catch (cause) {
    return { ok: false, bytes: null, message: describe(cause, baseUrl) }
  }
}

/**
 * Reads a body, giving up past a limit.
 *
 * `content-length` is checked first but cannot be trusted on its own: a wrong
 * port pointed at something that streams without ever ending would otherwise
 * take the main process's memory with it.
 */
async function readCapped(response: Response, limit: number): Promise<Buffer | null> {
  const body = response.body
  if (!body) return null

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks)
}

/**
 * Best-effort tidying up after a run we gave up on.
 *
 * Both are deliberately silent. Cleanup that failed must never replace the
 * message explaining why we were cleaning up.
 */
export async function abandon(baseUrl: string, promptId: string | null): Promise<void> {
  const signal = AbortSignal.timeout(3_000)

  await fetch(`${baseUrl}/interrupt`, { method: 'POST', signal }).catch(() => {})

  if (promptId) {
    await fetch(`${baseUrl}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: [promptId] }),
      signal
    }).catch(() => {})
  }
}
