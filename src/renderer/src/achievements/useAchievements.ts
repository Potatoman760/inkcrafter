import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyAchievements, type AchievementDocument } from '@shared/bundle/achievementDoc'
import type { Project } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

export interface AchievementSession {
  doc: AchievementDocument
  loading: boolean
  saving: boolean
  error: string | null
  apply: (next: AchievementDocument) => void
  flush: () => Promise<void>
}

export function useAchievements(
  project: Project | null,
  active: boolean,
  reloadKey = 0
): AchievementSession {
  const [doc, setDoc] = useState<AchievementDocument>(() => emptyAchievements())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<AchievementDocument | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project

  useEffect(() => {
    if (!active || !project) return
    let cancelled = false
    setLoading(true)
    void window.inkcrafter.achievements.read(project)
      .then((loaded) => { if (!cancelled) setDoc(loaded) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [active, project?.id, reloadKey])

  const flush = useCallback(async () => {
    const current = projectRef.current
    const queued = pending.current
    pending.current = null
    if (!current || queued === null) return
    setSaving(true)
    try {
      await window.inkcrafter.achievements.write(current, queued)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    void flush()
  }, [flush])

  const apply = useCallback((next: AchievementDocument) => {
    setDoc(next)
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
  }, [flush])

  return { doc, loading, saving, error, apply, flush }
}
