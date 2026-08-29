import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyManuscript, type Manuscript } from '@shared/manuscript'
import type { TagCommand } from '@shared/bundle/tagSpec'
import type { Project } from '@shared/project'

export interface ManuscriptSession {
  manuscript: Manuscript
  loading: boolean
  /**
   * What the last action refused to do, until somebody has shown it.
   *
   * A refusal here is a fact about the story rather than a failure of the app —
   * a knot nothing diverts to, a line the runtime built rather than read — so
   * it is reported and cleared, not held. `dismissError` is how the thing that
   * showed it says so.
   */
  error: string | null
  dismissError(): void
  choose(nodeId: string, choiceIndex: number): Promise<void>
  /** Rewrites the ink behind a line. `choiceIndex` null edits a prose paragraph. */
  edit(nodeId: string, choiceIndex: number | null, text: string): Promise<void>
  /** Fills the manuscript with a path reaching `knot`. */
  traceTo(knot: string): Promise<void>
  /** Puts drafted prose into the ink. Returns an error message, or null. */
  compose(sectionIndex: number, mode: 'insert' | 'replace', text: string): Promise<string | null>
  /**
   * Writes one `#` tag into a section, replacing whatever spoke to the same
   * subject — or the tag named by `replacing`, which is what editing a row does.
   */
  setTag(sectionIndex: number, command: TagCommand, replacing?: string): Promise<void>
  /** Takes one tag out of a section, named by exactly the text in the file. */
  clearTag(sectionIndex: number, raw: string): Promise<void>
  /**
   * Set after a successful trace, for a note in the header. `startedAt` names
   * the knot the reading had to begin at when no route to `knot` was found.
   */
  traced: { knot: string; steps: number; startedAt: string | null } | null
  reload(): Promise<void>
}

/**
 * Holds the reading of one story.
 *
 * The runtime itself lives in the main process — it has to, because source
 * anchors only exist on the compiler's in-memory story — so this is a thin
 * client over that session rather than a second copy of the state.
 */
export function useManuscript(
  project: Project | null,
  entryPath: string | null,
  reloadKey = 0
): ManuscriptSession {
  const [manuscript, setManuscript] = useState<Manuscript>(() => emptyManuscript('', ''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [traced, setTraced] = useState<
    { knot: string; steps: number; startedAt: string | null } | null
  >(null)

  // Read inside callbacks that must not close over a stale project.
  const projectRef = useRef(project)
  projectRef.current = project
  const entryRef = useRef(entryPath)
  entryRef.current = entryPath

  const load = useCallback(async () => {
    const currentProject = projectRef.current
    const currentEntry = entryRef.current
    if (!currentProject || !currentEntry) {
      setManuscript(emptyManuscript('', ''))
      return
    }

    setLoading(true)
    try {
      setManuscript(await window.inkcrafter.manuscript.open(currentProject, currentEntry))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, project?.id, entryPath, reloadKey])

  // The session holds a compiled story in main; let it go when the view does.
  useEffect(() => () => void window.inkcrafter.manuscript.close(), [])

  const choose = useCallback(async (nodeId: string, choiceIndex: number) => {
    try {
      setManuscript(await window.inkcrafter.manuscript.choose(nodeId, choiceIndex))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const edit = useCallback(async (nodeId: string, choiceIndex: number | null, text: string) => {
    try {
      const outcome = await window.inkcrafter.manuscript.edit(nodeId, choiceIndex, text)
      setManuscript(outcome.manuscript)
      // A refusal is information, not a failure — the line simply has no single
      // place in the file to write to.
      setError(outcome.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const traceTo = useCallback(async (knot: string) => {
    const currentProject = projectRef.current
    const currentEntry = entryRef.current
    if (!currentProject || !currentEntry) return

    setLoading(true)
    try {
      const outcome = await window.inkcrafter.manuscript.traceTo(
        currentProject,
        currentEntry,
        knot
      )
      setManuscript(outcome.manuscript)
      setError(outcome.error)
      setTraced(
        outcome.error === null
          ? { knot, steps: outcome.steps, startedAt: outcome.startedAt }
          : null
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Both staging calls behave like `edit`: main writes the line, recompiles and
   * hands back a fresh manuscript, and a refusal comes back as a message rather
   * than a throw — a section with no line to attach to is a fact about the
   * story, not a failure of the app.
   */
  const setTag = useCallback(
    async (sectionIndex: number, command: TagCommand, replacing?: string) => {
    try {
      const outcome = await window.inkcrafter.manuscript.setSectionTag(
        sectionIndex,
        command,
        replacing
      )
      setManuscript(outcome.manuscript)
      setError(outcome.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  },
    []
  )

  const clearTag = useCallback(async (sectionIndex: number, raw: string) => {
    try {
      const outcome = await window.inkcrafter.manuscript.clearSectionTag(sectionIndex, raw)
      setManuscript(outcome.manuscript)
      setError(outcome.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const dismissError = useCallback(() => setError(null), [])

  /**
   * The one that does not report through `error`.
   *
   * The write panel shows a refused draft in place, beside the draft it
   * refused, and toasting it as well would be the same sentence twice — the
   * house rule is that anything already on screen is not toasted.
   */
  const compose = useCallback(
    async (sectionIndex: number, mode: 'insert' | 'replace', text: string): Promise<string | null> => {
      try {
        const outcome = await window.inkcrafter.manuscript.compose(sectionIndex, mode, text)
        setManuscript(outcome.manuscript)
        return outcome.error
      } catch (cause) {
        return cause instanceof Error ? cause.message : String(cause)
      }
    },
    []
  )

  return {
    manuscript,
    loading,
    error,
    choose,
    edit,
    traceTo,
    traced,
    compose,
    setTag,
    clearTag,
    dismissError,
    reload: load
  }
}
