import { useCallback, useState } from 'react'

/**
 * A pane width that survives a restart.
 *
 * Kept in localStorage rather than the settings file: it is per-machine window
 * furniture, not part of the project or the author's configuration, and losing
 * it costs one drag. Every access is guarded because a renderer loaded from
 * `file://` is not guaranteed a usable storage area, and a layout preference is
 * never worth failing to start over.
 */
function read(key: string, fallback: number): number {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored === null) return fallback
    const parsed = Number.parseInt(stored, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function usePaneWidth(key: string, fallback: number): [number, (value: number) => void, (value: number) => void] {
  const [width, setWidth] = useState(() => read(key, fallback))

  const commit = useCallback(
    (value: number) => {
      setWidth(value)
      try {
        window.localStorage.setItem(key, String(Math.round(value)))
      } catch {
        // Not worth surfacing: the pane simply starts at its default next time.
      }
    },
    [key]
  )

  return [width, setWidth, commit]
}
