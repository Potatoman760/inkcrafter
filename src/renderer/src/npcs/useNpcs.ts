import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import type { Project } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

export interface NpcsSession {
  doc: NpcDocument
  loading: boolean
  saving: boolean
  error: string | null
  /** Applies a change; written, and the ink regenerated, on a debounce. */
  apply: (next: NpcDocument) => void
  /** Writes immediately, for closing the dialog and for Ctrl+S. */
  flush: () => Promise<void>
}

/**
 * The project's cast.
 *
 * The same shape as `useStats`, deliberately — it is the same kind of document
 * with the same consequence, that saving it rewrites `ink/state.ink`. The two
 * share that generated file, so `onWritten` matters here for the same reason:
 * whatever is showing the ink has to reread it.
 */
export function useNpcs(
  project: Project | null,
  active: boolean,
  reloadKey = 0,
  onWritten?: (paths: string[]) => void
): NpcsSession {
  const [doc, setDoc] = useState<NpcDocument>(() => emptyNpcs())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<NpcDocument | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project
  const onWrittenRef = useRef(onWritten)
  onWrittenRef.current = onWritten

  useEffect(() => {
    if (!active || !project) return

    let cancelled = false
    setLoading(true)
    window.inkcrafter.npcs
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
      const { written } = await window.inkcrafter.npcs.write(current, queued)
      setError(null)
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
    (next: NpcDocument) => {
      setDoc(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  return { doc, loading, saving, error, apply, flush }
}
