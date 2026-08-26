import {
  abandon,
  comfyClientId,
  fetchImage,
  queueDepth,
  readHistory,
  submitPrompt,
  type ComfyImageRef
} from './client'
import { watchComfy, type Watcher } from './progress'

/**
 * One generation, from queueing it to holding the bytes.
 *
 * Two clocks matter here and they are not the same. The first is a short one on
 * the very first request: a mistyped host must cost ten seconds, not five
 * minutes, and only that first call can tell the difference between "the address
 * is wrong" and "the picture is taking a while". The second is the real
 * deadline, which covers everything and exists because the chat loop awaits each
 * tool and has no timeout of its own — without it, a ComfyUI that stops
 * answering hangs the tool, which hangs the turn, which hangs the window.
 *
 * Completion is decided by `/history` alone. The websocket is livelier and says
 * more, but it drops and reconnects and misses things, so it narrates and
 * `/history` decides. They can never disagree, because only one of them is
 * asked.
 */

/** How long the first request may take before the address is judged wrong. */
const FIRST_CALL_MS = 10_000

/** How often to ask whether it is done, once it is actually running. */
const POLL_RUNNING_MS = 400

/** And while it is still behind other people's work. */
const POLL_QUEUED_MS = 1_500

export interface GenerateRequest {
  baseUrl: string
  /** The workflow, with the author's values already written into it. */
  prompt: Record<string, unknown>
  /** Whose pictures to collect. Null falls back to any the run produced. */
  outputNode: string | null
  timeoutMs: number
  onProgress?: (note: string) => void
  /** Injected by tests, so nothing here ever opens a socket. */
  watch?: Watcher
  /**
   * How long to wait between asking whether it is done. Defaults above.
   *
   * Overridable so a test of the waiting does not have to spend seconds
   * waiting, which is the difference between a case being covered and it being
   * quietly dropped for making the suite slow.
   */
  pollMs?: { running: number; queued: number }
}

export interface GenerateResult {
  ok: boolean
  message: string
  bytes: Buffer | null
  /** What ComfyUI called it, for the record. */
  filename: string | null
}

function failed(message: string): GenerateResult {
  return { ok: false, message, bytes: null, filename: null }
}

/** A wait that ends early when the deadline fires, rather than outliving it. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

type WaitOutcome =
  | { kind: 'images'; images: ComfyImageRef[] }
  | { kind: 'failed'; message: string }

/** Polls until the job is done, has failed, or the deadline has fired. */
async function waitForIt(
  request: GenerateRequest,
  promptId: string,
  signal: AbortSignal,
  say: (text: string) => void
): Promise<WaitOutcome> {
  const { baseUrl, outputNode } = request
  let announced = ''

  for (;;) {
    if (signal.aborted) {
      await abandon(baseUrl, promptId)
      return {
        kind: 'failed',
        message: `ComfyUI did not finish within ${Math.round(request.timeoutMs / 1000)} seconds, so the job was cancelled. Nothing was written.`
      }
    }

    const history = await readHistory(baseUrl, promptId, outputNode, signal)

    if (history.done) {
      if (history.error) return { kind: 'failed', message: history.error }
      if (history.images.length === 0) {
        return {
          kind: 'failed',
          message:
            'The workflow ran but saved no picture. It probably has no SaveImage node — add one in ComfyUI and export it again.'
        }
      }
      return { kind: 'images', images: history.images }
    }

    const depth = await queueDepth(baseUrl, promptId, signal)
    const running = depth === null || depth.running || depth.ahead === 0

    // Said only when it changes: the socket emits step counts over the top of
    // this, and repeating "queued" every second would bury them.
    const saying = running
      ? 'ComfyUI is working…'
      : `queued — ${depth.ahead} job${depth.ahead === 1 ? '' : 's'} ahead`
    if (saying !== announced) {
      announced = saying
      say(saying)
    }

    const wait = request.pollMs ?? { running: POLL_RUNNING_MS, queued: POLL_QUEUED_MS }
    await delay(running ? wait.running : wait.queued, signal)
  }
}

export async function generateImage(request: GenerateRequest): Promise<GenerateResult> {
  const { baseUrl } = request
  const note = (text: string): void => request.onProgress?.(text)

  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), request.timeoutMs)
  let stopWatching: (() => void) | null = null

  try {
    note('asking ComfyUI to run the workflow…')

    const submitted = await submitPrompt(
      baseUrl,
      request.prompt,
      AbortSignal.any([deadline.signal, AbortSignal.timeout(FIRST_CALL_MS)])
    )
    if (!submitted.ok || submitted.promptId === null) return failed(submitted.message)

    // From here on, a failure of the socket is not a failure of the run.
    try {
      const watch = request.watch ?? watchComfy
      stopWatching = watch(baseUrl, comfyClientId(), (event) => {
        if (event.kind === 'progress' && event.max > 0) note(`step ${event.value} of ${event.max}`)
      })
    } catch {
      stopWatching = null
    }

    const outcome = await waitForIt(request, submitted.promptId, deadline.signal, note)
    if (outcome.kind === 'failed') return failed(outcome.message)

    note('fetching the picture…')
    const picture = outcome.images[0]!
    const image = await fetchImage(baseUrl, picture, deadline.signal)
    if (!image.ok || !image.bytes) return failed(image.message)

    return { ok: true, message: '', bytes: image.bytes, filename: picture.filename }
  } finally {
    clearTimeout(timer)
    try {
      stopWatching?.()
    } catch {
      // A watcher that cannot be stopped is still not a failed generation.
    }
  }
}
