import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyStats, type StatsDocument } from '@shared/statsDoc'
import type { Project } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

export interface StatsSession {
  doc: StatsDocument
  loading: boolean
  saving: boolean
  error: string | null
  /** Applies a change; written, and the ink regenerated, on a debounce. */
  apply: (next: StatsDocument) => void
  /** Writes immediately, for closing the dialog and for Ctrl+S. */
  flush: () => Promise<void>
}

/**
 * The project's catalogue of player-visible stats, hidden vars and items.
 *
 * Autosaved like the plan, and for the same reason: it is the app's own document
 * and nothing else reads it mid-edit. Unlike the plan, saving it also rewrites
 * `ink/state.ink`, so a save is a real change to the story — which is why
 * `onWritten` exists, to tell the app which files moved underneath it.
 */
export function useStats(
  project: Project | null,
  active: boolean,
  reloadKey = 0,
  onWritten?: (paths: string[]) => void
): StatsSession {
  const [doc, setDoc] = useState<StatsDocument>(() => emptyStats())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<StatsDocument | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project
  const onWrittenRef = useRef(onWritten)
  onWrittenRef.current = onWritten

  useEffect(() => {
    if (!active || !project) return

    let cancelled = false
    setLoading(true)
    window.inkcrafter.stats
      .read(project)
      .then((loaded) => {
        if (!cancelled) setDoc(loaded)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [active, project?.id, reloadKey])

  const flush = useCallback(async () => {
    const current = projectRef.current
    const queued = pending.current
    pending.current = null
    if (!current || queued === null) return

    setSaving(true)
    try {
      const { written } = await window.inkcrafter.stats.write(current, queued)
      setError(null)
      // state.ink was just rewritten; whatever is showing it has to reread.
      if (written.length > 0) onWrittenRef.current?.(written)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [])

  // Closing the dialog must not drop the last edit.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    },
    [flush]
  )

  const apply = useCallback(
    (next: StatsDocument) => {
      setDoc(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  return { doc, loading, saving, error, apply, flush }
}
