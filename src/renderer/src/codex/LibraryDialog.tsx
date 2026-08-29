import { useEffect, useState } from 'react'
import type { CodexLibrary, Project } from '@shared/project'
import { Icon } from '../design/Icon'
import { Badge, Button, Dialog, Field, Hint, Input, ListRow } from '../design/components'
import { copy } from '@shared/copy'
import { CodexTextarea } from './CodexTextarea'

interface LibraryDialogProps {
  project: Project
  libraries: CodexLibrary[]
  /** Toggles whether the project draws on a library. */
  onToggle: (libraryId: string, linked: boolean) => void
  onSaveLibrary: (library: CodexLibrary) => Promise<void>
  onCreate: (title: string) => Promise<CodexLibrary | null>
  onReveal: (libraryId: string) => void
  onClose: () => void
}

/**
 * Managing the codex libraries a project draws on.
 *
 * A dialog rather than a pane, for the same reason as the entry editor: the
 * pane it used to live in only exists in the editor view, so the button that
 * opened it did nothing at all while reading the manuscript.
 *
 * Linking applies immediately — it is a one-line change to the project manifest
 * and trivially reversible. A library's own title and description are a
 * document, so those are saved explicitly.
 */
export function LibraryDialog({
  project,
  libraries,
  onToggle,
  onSaveLibrary,
  onCreate,
  onReveal,
  onClose
}: LibraryDialogProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(libraries[0]?.id ?? null)
  const [draft, setDraft] = useState<CodexLibrary | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = libraries.find((library) => library.id === selectedId) ?? null

  useEffect(() => {
    setDraft(selected ? { ...selected } : null)
  }, [selected?.id])

  const dirty =
    draft !== null &&
    selected !== null &&
    (draft.title !== selected.title || draft.description !== selected.description)

  const create = async (): Promise<void> => {
    const title = newTitle.trim()
    if (title.length === 0) return
    setBusy(true)
    const library = await onCreate(title)
    setBusy(false)
    setNewTitle('')
    if (library) {
      setSelectedId(library.id)
      // A library made from here is almost certainly wanted by this project.
      onToggle(library.id, true)
    }
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    await onSaveLibrary(draft)
    setBusy(false)
  }

  const linkedCount = libraries.filter((library) => project.libraries.includes(library.id)).length

  return (
    <Dialog
      title="Codex libraries"
      className="entry-dialog"
      onClose={onClose}
      // Each library saves itself as it is edited, so there is no dialog-wide
      // action and no footer — the header's close is the way out.
    >
      <Hint tight>
        A library is a collection of entries that any number of projects can draw on, so a cast
        can serve a whole series without being copied into each game. Anything true of only one
        story belongs in a library of its own — editing a shared entry reaches every project
        that links it. <strong>{project.title}</strong> uses {linkedCount} of {libraries.length}.
      </Hint>

      <div className="provider-layout">
        <div className="provider-list">
          {libraries.length === 0 && <Hint>No libraries yet.</Hint>}

          {libraries.map((library) => {
            const linked = project.libraries.includes(library.id)
            return (
              <div
                key={library.id}
                className={`library-row ${library.id === selectedId ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={linked}
                  aria-label={`Use ${library.title} in this project`}
                  onChange={(event) => onToggle(library.id, event.target.checked)}
                />
                <ListRow
                  className="library-name"
                  name={library.title}
                  onClick={() => setSelectedId(library.id)}
                />
                <Badge title="Entries in this library">
                  {library.entryCount}
                </Badge>
              </div>
            )
          })}

          <div className="detail-row">
            <Input
              value={newTitle}
              aria-label="New library"
              placeholder="Name"
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create()
              }}
            />
            <Button onClick={() => void create()} disabled={busy || newTitle.trim().length === 0}>
              Create
            </Button>
          </div>
        </div>

        {draft ? (
          <div className="provider-editor">
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>

            <Field label="About" about={copy('library.about')}>
              <CodexTextarea
                rows={6}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>

            <Hint tight>
              {draft.entryCount} entr{draft.entryCount === 1 ? 'y' : 'ies'} · {draft.id}
            </Hint>

            <div className="detail-row">
              <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button onClick={() => onReveal(draft.id)}><Icon name="folder-open" size={13} />Open folder</Button>
            </div>

            <Hint tight>
              Deleting a library means deleting its folder, which is done outside the app so
              that a collection several projects rely on cannot go in one click.
            </Hint>
          </div>
        ) : (
          <Hint>Create a library, or pick one to describe it.</Hint>
        )}
      </div>
    </Dialog>
  )
}
