import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastTone } from '../design/components/Toast'

export interface ToastEntry {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

/** Long enough to read a path, short enough not to sit on the pane. */
const DISMISS_AFTER_MS = 6000

/** Two at most; a third would start stacking over the content it reports on. */
const MAX = 2

export interface Toasts {
  entries: ToastEntry[]
  /** Confirms files the author cannot see being written. */
  wrote: (paths: string[]) => void
  show: (toast: Omit<ToastEntry, 'id'>) => void
  dismiss: (id: number) => void
}

/**
 * The toast queue.
 *
 * Toasts exist for writes that happen where nobody is looking — the catalogues
 * regenerating `ink/state.ink`, the assistant editing a file, an export landing
 * in a folder. Anything already visible on screen must not be toasted, so the
 * decision about *whether* to call this lives at the call site, where it knows
 * what is on screen.
 *
 * `ok` clears itself after a few seconds. `error` never does: an error that
 * vanishes before it is read is worse than no error, because the author now
 * believes the write succeeded.
 */
export function useToasts(): Toasts {
  const [entries, setEntries] = useState<ToastEntry[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number): void => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const show = useCallback(
    (toast: Omit<ToastEntry, 'id'>): void => {
      const id = nextId.current++
      setEntries((current) => {
        // A debounced save can report the same write twice in a row. Saying it
        // twice is not more accountable, and "never toast what is already on
        // screen" covers a copy of the toast already on screen.
        const withoutEcho =
          current[current.length - 1]?.title === toast.title ? current.slice(0, -1) : current

        // The oldest goes rather than the newest being dropped: the most recent
        // write is the one the author is trying to understand.
        return [...withoutEcho, { ...toast, id }].slice(-MAX)
      })

      if (toast.tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
        )
      }
    },
    [dismiss]
  )

  const wrote = useCallback(
    (paths: string[]): void => {
      if (paths.length === 0) return

      // Lead with the generated ink. Saving a catalogue also rewrites its own
      // JSON and an export, but those are bookkeeping the author expects; the
      // ink is the file that changes what the story does, and the one they
      // cannot see being written.
      const lead = paths.find((path) => path.endsWith('.ink')) ?? paths[0]!
      const rest = paths.length - 1

      show({
        tone: 'ok',
        title: `Wrote ${lead}`,
        detail: rest > 0 ? `and ${rest} more` : undefined
      })
    },
    [show]
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return { entries, wrote, show, dismiss }
}
