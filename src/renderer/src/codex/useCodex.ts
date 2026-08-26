import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { newEntry, slugifyPath, type CodexEntry, type CodexType } from '@shared/codex'
import { findNameConflicts } from '@shared/mentions'
import type { CodexLibrary, NameConflict, Project } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

export interface Codex {
  /** Entries from every library the project links, flattened. */
  entries: CodexEntry[]
  /** Every library in the workspace, linked or not. */
  libraries: CodexLibrary[]
  conflicts: NameConflict[]
  loading: boolean
  error: string | null
  create(name: string, type: CodexType, libraryId: string): Promise<CodexEntry | null>
  update(entry: CodexEntry): void
  /** Writes immediately rather than on the debounce. Returns an error, or null. */
  saveNow(entry: CodexEntry): Promise<string | null>
  remove(entry: CodexEntry): Promise<void>
  /** Moves an entry's file within its library. Its id and every link are unaffected. */
  move(entry: CodexEntry, toFile: string): Promise<void>
  createLibrary(title: string): Promise<CodexLibrary | null>
  reload(): Promise<void>
}

/**
 * Owns the codex for the open project: the entries of every library it links.
 *
 * Edits land in React state immediately and are written to disk on a debounce,
 * so typing in an entry stays responsive and does not produce a filesystem
 * write per keystroke.
 */
export function useCodex(project: Project | null, reloadKey = 0): Codex {
  const [entries, setEntries] = useState<CodexEntry[]>([])
  const [libraries, setLibraries] = useState<CodexLibrary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = useRef(new Map<string, CodexEntry>())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const reloadRequest = useRef(0)
  // Relation comments are regenerated on write from this map.
  const namesRef = useRef<Record<string, string>>({})

  const projectId = project?.id ?? ''
  // The manifest on disk wins; this is only the fallback if the project was
  // removed between opening it and reloading its codex.
  const fallbackLibraryKey = project?.libraries.join(',') ?? ''

  const reload = useCallback(async () => {
    const request = ++reloadRequest.current
    setLoading(true)
    try {
      const [loadedLibraries, projects] = await Promise.all([
        window.inkcrafter.libraries.list(),
        projectId.length > 0 ? window.inkcrafter.projects.list() : Promise.resolve([])
      ])
      const latest = projects.find((candidate) => candidate.id === projectId)
      const ids = latest?.libraries ?? (fallbackLibraryKey.length > 0 ? fallbackLibraryKey.split(',') : [])
      const loadedEntries = ids.length > 0 ? await window.inkcrafter.codex.load(ids) : []
      if (request !== reloadRequest.current) return
      setLibraries(loadedLibraries)
      setEntries(loadedEntries)
      setError(null)
    } catch (cause) {
      if (request === reloadRequest.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (request === reloadRequest.current) setLoading(false)
    }
  }, [projectId, fallbackLibraryKey, reloadKey])

  useEffect(() => {
    void reload()
  }, [reload])

  namesRef.current = useMemo(
    () => Object.fromEntries(entries.map((entry) => [entry.id, entry.name])),
    [entries]
  )

  const flush = useCallback(async () => {
    if (pending.current.size === 0) return

    const queued = [...pending.current.values()]
    pending.current.clear()

    try {
      await Promise.all(
        queued.map((entry) => window.inkcrafter.codex.save(entry, namesRef.current))
      )
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      void flush()
    },
    [flush]
  )

  const update = useCallback(
    (entry: CodexEntry) => {
      setEntries((previous) =>
        previous
          .map((existing) => (existing.id === entry.id ? entry : existing))
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      pending.current.set(entry.id, entry)
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  /**
   * Used by the entry dialog, where the author presses Save and expects the
   * file to be written before the dialog closes — not up to half a second later.
   */
  const saveNow = useCallback(async (entry: CodexEntry): Promise<string | null> => {
    // Drop any debounced copy of this entry, or the older draft would land
    // after the newer one.
    pending.current.delete(entry.id)

    setEntries((previous) =>
      previous
        .map((existing) => (existing.id === entry.id ? entry : existing))
        .sort((a, b) => a.name.localeCompare(b.name))
    )

    try {
      await window.inkcrafter.codex.save(entry, { ...namesRef.current, [entry.id]: entry.name })
      setError(null)
      return null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      return message
    }
  }, [])

  const create = useCallback(
    async (name: string, type: CodexType, libraryId: string): Promise<CodexEntry | null> => {
      const trimmed = name.trim() || 'New entry'

      // Filenames must be unique within a library; ids already are by construction.
      const taken = new Set(
        entries.filter((entry) => entry.libraryId === libraryId).map((entry) => entry.file)
      )
      const base = slugifyPath(trimmed)
      let file = base
      for (let suffix = 2; taken.has(file); suffix++) file = `${base}-${suffix}`

      const entry = newEntry(libraryId, trimmed, type, file)
      try {
        await window.inkcrafter.codex.save(entry, namesRef.current)
        setEntries((previous) => [...previous, entry].sort((a, b) => a.name.localeCompare(b.name)))
        setError(null)
        return entry
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return null
      }
    },
    [entries]
  )

  const remove = useCallback(async (entry: CodexEntry) => {
    pending.current.delete(entry.id)
    try {
      await window.inkcrafter.codex.remove(entry)
      const survivors = entriesRef.current
        .filter((candidate) => candidate.id !== entry.id)
        .map((candidate) =>
          candidate.relations.includes(entry.id)
            ? {
                ...candidate,
                relations: candidate.relations.filter((id) => id !== entry.id)
              }
            : candidate
        )
      const changed = survivors.filter((candidate) =>
        entriesRef.current
          .find((previous) => previous.id === candidate.id)
          ?.relations.includes(entry.id)
      )
      setEntries(survivors)
      entriesRef.current = survivors

      // A relation removed only from React state returns after the next reload.
      // Save every affected entry now, and cancel any older debounced copy that
      // would otherwise put the deleted id back moments later.
      const names = Object.fromEntries(survivors.map((candidate) => [candidate.id, candidate.name]))
      for (const candidate of changed) pending.current.delete(candidate.id)
      await Promise.all(
        changed.map((candidate) => window.inkcrafter.codex.save(candidate, names))
      )
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const move = useCallback(
    async (entry: CodexEntry, toFile: string) => {
      // Write queued edits under the old filename first, or the flush would
      // recreate it moments after the move.
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()

      try {
        await window.inkcrafter.codex.move(entry, toFile)
        setEntries((previous) =>
          previous.map((candidate) =>
            candidate.id === entry.id ? { ...candidate, file: toFile } : candidate
          )
        )
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [flush]
  )

  const createLibrary = useCallback(async (title: string): Promise<CodexLibrary | null> => {
    try {
      const library = await window.inkcrafter.libraries.create(title)
      setLibraries(await window.inkcrafter.libraries.list())
      setError(null)
      return library
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return null
    }
  }, [])

  const conflicts = useMemo(() => findNameConflicts(entries), [entries])

  return {
    entries,
    libraries,
    conflicts,
    loading,
    error,
    create,
    update,
    saveNow,
    remove,
    move,
    createLibrary,
    reload
  }
}
