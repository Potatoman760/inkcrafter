import { comfyWsUrl } from './client'

/**
 * ComfyUI's progress socket — a decoration, and treated as one.
 *
 * `/history` cannot say "step 12 of 20": it returns nothing at all until the job
 * has finished. Only the socket knows what is happening while it happens, so
 * that is what this is for and it is the only thing it is for.
 *
 * It decides nothing. Every failure here — a socket that will not open, one that
 * drops halfway, a message in a shape a future ComfyUI invented — ends with this
 * quietly stopping, while the run carries on polling and finishes normally. A
 * generation must never fail because the thing narrating it did.
 */

export type ComfyEvent =
  | { kind: 'progress'; value: number; max: number }
  | { kind: 'executing'; node: string | null }

/** Injected into a run, so tests drive progress without opening a socket. */
export type Watcher = (baseUrl: string, clientId: string, on: (event: ComfyEvent) => void) => () => void

export const watchComfy: Watcher = (baseUrl, clientId, on) => {
  let socket: WebSocket | null = null

  try {
    socket = new WebSocket(comfyWsUrl(baseUrl, clientId))
  } catch {
    return () => {}
  }

  const stop = (): void => {
    try {
      socket?.close()
    } catch {
      // Closing a socket that never opened throws on some platforms.
    }
    socket = null
  }

  socket.onerror = stop
  socket.onclose = () => {
    socket = null
  }

  socket.onmessage = (message: MessageEvent): void => {
    // Binary frames carry preview images, which this has no use for.
    if (typeof message.data !== 'string') return

    let body: unknown
    try {
      body = JSON.parse(message.data)
    } catch {
      return
    }

    const record = body as { type?: unknown; data?: unknown }
    const data = (record.data ?? {}) as Record<string, unknown>

    // No filtering by job here: ComfyUI routes execution events to the client
    // id that queued the work, and the app queues everything under one.
    if (record.type === 'progress' && typeof data['value'] === 'number' && typeof data['max'] === 'number') {
      on({ kind: 'progress', value: data['value'], max: data['max'] })
      return
    }

    if (record.type === 'executing') {
      const node = data['node']
      on({ kind: 'executing', node: typeof node === 'string' ? node : null })
    }
  }

  return stop
}
