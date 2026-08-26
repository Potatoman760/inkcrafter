import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyMap, type MapDocument } from '@shared/bundle/mapDoc'
import type { KnotSource } from '@shared/inkKnots'
import type { Project } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

export interface MapSession {
  doc: MapDocument
  /** Every knot the project declares, alphabetical, for choosing a destination. */
  knots: string[]
  /** The same knots with the file that declares each, for grouping by the plan. */
  knotSources: KnotSource[]
  loading: boolean
  saving: boolean
  error: string | null
  apply: (next: MapDocument) => void
  flush: () => Promise<void>
}

/**
 * The project's world map.
 *
 * Autosaved like the other catalogues, but with one difference worth noting:
 * saving generates no ink. A map is read by the game and never by the compiler,
 * so nothing else in the app has to be told it changed.
 */
export function useMap(project: Project | null, active: boolean, reloadKey = 0): MapSession {
  const [doc, setDoc] = useState<MapDocument>(() => emptyMap())
  const [knotSources, setKnotSources] = useState<KnotSource[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<MapDocument | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project

  useEffect(() => {
    if (!active || !project) return

    let cancelled = false
    setLoading(true)
    Promise.all([window.inkcrafter.map.read(project), window.inkcrafter.map.destinations(project)])
      .then(([loaded, destinations]) => {
        if (cancelled) return
        setDoc(loaded)
        setKnotSources(destinations)
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
      await window.inkcrafter.map.write(current, queued)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    },
    [flush]
  )

  const apply = useCallback(
    (next: MapDocument) => {
      setDoc(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  // Alphabetical here rather than at the source: the scan orders knots by file
  // and declaration, which is what the plan grouping needs, and a picker wants
  // the other one.
  const knots = knotSources.map((one) => one.knot).sort((a, b) => a.localeCompare(b))

  return { doc, knots, knotSources, loading, saving, error, apply, flush }
}
