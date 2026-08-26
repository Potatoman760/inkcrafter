import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/project'
import { Button, Hint, Input } from '../design/components'

interface ProjectPickerProps {
  onOpen: (project: Project) => void
  /** True when the picker was reached via File › New Project…, to focus the title input. */
  autoFocusNew?: boolean
}

/**
 * The start screen. A project is the top level, so there is nothing useful to
 * show until one is chosen.
 */
export function ProjectPicker({ onOpen, autoFocusNew = false }: ProjectPickerProps): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocusNew) titleRef.current?.focus()
  }, [autoFocusNew])

  useEffect(() => {
    window.inkcrafter.projects
      .list()
      .then(setProjects)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false))
  }, [])

  const create = async (): Promise<void> => {
    const trimmed = title.trim()
    if (trimmed.length === 0) return

    setBusy(true)
    try {
      onOpen(await window.inkcrafter.projects.create(trimmed))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="picker">
      <div className="picker-card">
        <h1 className="picker-title">InkCrafter</h1>
        <p className="picker-subtitle">Choose a project, or start a new one.</p>

        {error && <p className="codex-error">{error}</p>}

        <div className="picker-list">
          {busy && projects.length === 0 && <Hint>Loading…</Hint>}
          {!busy && projects.length === 0 && (
            <Hint>No projects yet.</Hint>
          )}
          {projects.map((project) => (
            // ic-row exception: three stacked parts — title, blurb, count —
            // where ListRow has a name and one meta line.
            <button key={project.id} className="ic-row picker-item" onClick={() => onOpen(project)}>
              <span className="picker-item-title">{project.title}</span>
              {project.description && (
                <span className="picker-item-blurb">{project.description.split('\n')[0]}</span>
              )}
              <span className="picker-item-meta">
                {project.libraries.length} librar{project.libraries.length === 1 ? 'y' : 'ies'}
              </span>
            </button>
          ))}
        </div>

        <div className="picker-new">
          <Input
            ref={titleRef}
            value={title}
            placeholder="New project title…"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
            }}
          />
          <Button onClick={() => void create()} disabled={busy || title.trim().length === 0}>
            Create
          </Button>
        </div>

        <Button variant="link" className="picker-folder" onClick={() => void window.inkcrafter.workspace.reveal()}>
          Open the data folder
        </Button>
      </div>
    </div>
  )
}
