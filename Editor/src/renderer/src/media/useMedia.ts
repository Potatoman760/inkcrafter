import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyMedia, type MediaDocument } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { MediaFile } from '@shared/types'

const SAVE_DEBOUNCE_MS = 500

export interface MediaSession {
  doc: MediaDocument
  /** Every image on disk under `media/`, catalogued or not. */
  files: MediaFile[]
  loading: boolean
  saving: boolean
  error: string | null
  apply: (next: MediaDocument) => void
  flush: () => Promise<void>
  /** Rereads the folder, for after files have been added outside the app. */
  rescan: () => Promise<void>
}

/**
 * The project's media catalogue, and what is actually in its folder.
 *
 * Both, because they are separate truths: the catalogue says a variant is
 * `sprites/wren-happy.png`, and only the folder can say whether that file is
 * still there. Keeping them apart is what lets the manager show a catalogued
 * asset with a missing file and a file nobody has filed yet, which are the two
 * states an author needs to see.
 */
export function useMedia(
  project: Project | null,
  active: boolean,
  reloadKey = 0
): MediaSession {
  const [doc, setDoc] = useState<MediaDocument>(() => emptyMedia())
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<MediaDocument | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project

  useEffect(() => {
    if (!active || !project) return

    let cancelled = false
    setLoading(true)

    void Promise.all([
      window.inkcrafter.media.read(project),
      window.inkcrafter.media.scan(project)
    ])
      .then(([loaded, found]) => {
        if (cancelled) return
        setDoc(loaded)
        setFiles(found)
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
      await window.inkcrafter.media.write(current, queued)
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
    (next: MediaDocument) => {
      setDoc(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  /** Files arrive from outside the app, so the only way to learn of one is to look. */
  const rescan = useCallback(async () => {
    const current = projectRef.current
    if (!current) return

    try {
      setFiles(await window.inkcrafter.media.scan(current))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  return { doc, files, loading, saving, error, apply, flush, rescan }
}
