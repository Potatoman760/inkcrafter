import { useCallback, useEffect, useRef, useState } from 'react'
import type { InkReference } from '@shared/inkRefs'
import type { InkMoveResult } from '@shared/types'
import type { Project, ProjectFile } from '@shared/project'

const SAVE_DEBOUNCE_MS = 500

function sameProject(left: Project, right: Project): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.main === right.main &&
    left.description === right.description &&
    left.bundleOut === right.bundleOut &&
    left.path === right.path &&
    left.libraries.length === right.libraries.length &&
    left.libraries.every((id, index) => id === right.libraries[index]) &&
    left.protection?.mode === right.protection?.mode &&
    left.protection?.keyId === right.protection?.keyId &&
    left.protection?.publicKey === right.protection?.publicKey
  )
}

export interface ProjectSession {
  project: Project | null
  files: ProjectFile[]
  /**
   * Every folder that could hold ink, including the empty ones.
   *
   * Kept beside the files rather than derived from them: a folder with nothing
   * in it has no path to be inferred from, and that is the state a folder is in
   * for as long as it takes to put the first file in it.
   */
  folders: string[]
  error: string | null
  open(project: Project): void
  close(): void
  /** Updates the manifest; persisted on a debounce. */
  update(project: Project): void
  refreshFiles(): Promise<void>
  addFile(path: string): Promise<ProjectFile | null>
  addFolder(path: string): Promise<boolean>
  /**
   * Renames or moves a file, following the INCLUDEs, the entry point and the
   * plan. Returns where it landed and what else was rewritten, or null if it
   * could not go — a caller showing one of those files has to re-read it.
   */
  moveFile(from: string, to: string): Promise<InkMoveResult | null>
  /** Copies a file into a folder, under a free name. Returns where it landed. */
  copyFile(from: string, toFolder: string): Promise<string | null>
  /** What points at a path. Ask before deleting, never after. */
  referencesTo(path: string): Promise<InkReference[]>
  deletePath(path: string): Promise<boolean>
}

/**
 * The open project, its ink files, and the folders they sit in.
 *
 * `reloadKey` is how anything outside this hook asks for the list to be read
 * again. The project's files are not only written by this app — an author
 * keeps a chapter open in another editor, a script generates one, `git
 * checkout` replaces the lot — and a file tree that only changes when this app
 * changes it is a file tree that is quietly wrong. The watcher in main reports
 * those writes, App turns them into a new key, and the list re-reads.
 */
export function useProject(reloadKey = 0): ProjectSession {
  const [project, setProject] = useState<Project | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const pending = useRef<Project | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    const queued = pending.current
    pending.current = null
    if (!queued) return

    try {
      await window.inkcrafter.projects.save(queued)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const refreshFiles = useCallback(async () => {
    if (!project) {
      setFiles([])
      setFolders([])
      return
    }
    try {
      // Assistant tools may change the manifest as well as the files — most
      // notably when a new codex library is linked. Adopt that copy before the
      // screens which depend on it reload.
      await flush()
      const projects = await window.inkcrafter.projects.list()
      const latest = projects.find((candidate) => candidate.id === project.id) ?? project
      const [nextFiles, nextFolders] = await Promise.all([
        window.inkcrafter.projects.files(latest),
        window.inkcrafter.projects.folders(latest)
      ])
      if (!sameProject(project, latest)) setProject(latest)
      setFiles(nextFiles)
      setFolders(nextFolders)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [project, flush])

  useEffect(() => {
    void refreshFiles()
    // `reloadKey` is a dependency with no other purpose: reading it here is
    // what makes somebody else's write re-read the tree.
  }, [refreshFiles, reloadKey])

  // Never leave manifest edits unwritten because the view changed.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      void flush()
    },
    [flush]
  )

  const update = useCallback(
    (next: Project) => {
      setProject(next)
      pending.current = next
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  const open = useCallback((next: Project) => {
    setProject(next)
    setError(null)
  }, [])

  const close = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    void flush()
    setProject(null)
    setFiles([])
    setFolders([])
  }, [flush])

  const addFile = useCallback(
    async (path: string): Promise<ProjectFile | null> => {
      if (!project) return null
      try {
        await window.inkcrafter.projects.addFile(project, path)
        const next = await window.inkcrafter.projects.files(project)
        setFiles(next)
        setFolders(await window.inkcrafter.projects.folders(project))
        setError(null)
        return next.find((file) => file.path === path) ?? null
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return null
      }
    },
    [project]
  )

  const addFolder = useCallback(
    async (path: string): Promise<boolean> => {
      if (!project) return false
      try {
        await window.inkcrafter.projects.addFolder(project, path)
        setFolders(await window.inkcrafter.projects.folders(project))
        setError(null)
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return false
      }
    },
    [project]
  )

  const moveFile = useCallback(
    async (from: string, to: string): Promise<InkMoveResult | null> => {
      if (!project) return null
      try {
        const result = await window.inkcrafter.projects.moveFile(project, from, to)
        // The manifest may have been rewritten under us — the entry point moves
        // with the file when the file *is* the entry point.
        const manifest = await window.inkcrafter.projects.list()
        const mine = manifest.find((one) => one.id === project.id)
        if (mine) setProject(mine)

        const [nextFiles, nextFolders] = await Promise.all([
          window.inkcrafter.projects.files(mine ?? project),
          window.inkcrafter.projects.folders(mine ?? project)
        ])
        setFiles(nextFiles)
        setFolders(nextFolders)
        setError(null)
        return result
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return null
      }
    },
    [project]
  )

  const copyFile = useCallback(
    async (from: string, toFolder: string): Promise<string | null> => {
      if (!project) return null
      try {
        const result = await window.inkcrafter.projects.copyFile(project, from, toFolder)
        const [nextFiles, nextFolders] = await Promise.all([
          window.inkcrafter.projects.files(project),
          window.inkcrafter.projects.folders(project)
        ])
        setFiles(nextFiles)
        setFolders(nextFolders)
        setError(null)
        return result.path
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return null
      }
    },
    [project]
  )

  const referencesTo = useCallback(
    async (path: string): Promise<InkReference[]> => {
      if (!project) return []
      try {
        return await window.inkcrafter.projects.references(project, path)
      } catch {
        // A failure to *look* must not stop the caller asking the question, so
        // it reports nothing found rather than nothing at all.
        return []
      }
    },
    [project]
  )

  const deletePath = useCallback(
    async (path: string): Promise<boolean> => {
      if (!project) return false
      try {
        await window.inkcrafter.projects.deleteFile(project, path)
        const [nextFiles, nextFolders] = await Promise.all([
          window.inkcrafter.projects.files(project),
          window.inkcrafter.projects.folders(project)
        ])
        setFiles(nextFiles)
        setFolders(nextFolders)
        setError(null)
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return false
      }
    },
    [project]
  )

  return {
    project,
    files,
    folders,
    error,
    open,
    close,
    update,
    refreshFiles,
    addFile,
    addFolder,
    moveFile,
    copyFile,
    referencesTo,
    deletePath
  }
}
