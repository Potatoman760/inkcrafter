import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyPlan, type PlanDocument } from '@shared/planDoc'
import type { Project } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

export interface PlanSession {
  plan: PlanDocument
  loading: boolean
  saving: boolean
  error: string | null
  /** Applies a change to the tree; written on a debounce. */
  apply: (next: PlanDocument) => void
  /** Accepts a plan the main process has already stored. */
  adopt: (next: PlanDocument) => void
  /** Writes immediately, for Ctrl+S and for leaving the view. */
  flush: () => Promise<void>
}

/**
 * The project's plan.
 *
 * Autosaved, unlike the ink editor. Ink is read from disk by the compiler and
 * the manuscript, so its save is deliberate; the plan is private structure that
 * nothing else reads mid-edit, and losing it to a forgotten keystroke would be
 * the worse failure.
 */
export function usePlan(project: Project | null, active: boolean, reloadKey = 0): PlanSession {
  const [plan, setPlan] = useState<PlanDocument>(() => emptyPlan())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<PlanDocument | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project

  useEffect(() => {
    if (!active || !project) return

    let cancelled = false
    setLoading(true)
    window.inkcrafter.plan
      .read(project)
      .then((loaded) => {
        if (!cancelled) setPlan(loaded)
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
    // reloadKey lets something outside this hook — the assistant, which writes
    // plan.json directly — force a reread of a plan it has changed underneath.
  }, [active, project?.id, reloadKey])

  const flush = useCallback(async () => {
    const current = projectRef.current
    const queued = pending.current
    pending.current = null
    if (!current || queued === null) return

    setSaving(true)
    try {
      const stored = await window.inkcrafter.plan.write(current, queued)
      // Do not overwrite an edit made while the write was in flight. The next
      // flush will receive the normalised copy for that newer draft instead.
      if (stored && pending.current === null) setPlan(stored)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [])

  // Leaving the view must not drop the last edit.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    },
    [flush]
  )

  const apply = useCallback(
    (next: PlanDocument) => {
      setPlan(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  const adopt = useCallback((next: PlanDocument): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    setPlan(next)
    setError(null)
  }, [])

  return { plan, loading, saving, error, apply, adopt, flush }
}
