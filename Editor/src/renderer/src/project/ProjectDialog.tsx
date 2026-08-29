import { useEffect, useState } from 'react'
import type { CodexLibrary, Project, ProjectFile } from '@shared/project'
import { Icon } from '../design/Icon'
import {
  Badge,
  Button,
  Dialog,
  DialogSpacer,
  Field,
  Hint,
  Input,
  Select,
  Textarea
} from '../design/components'
import { copy } from '@shared/copy'

interface ProjectDialogProps {
  project: Project
  files: ProjectFile[]
  libraries: CodexLibrary[]
  onSave: (project: Project) => void
  onManageLibraries: () => void
  onReveal: () => void
  onClose: () => void
}

/**
 * The project's own settings: what it is called, what it is about, which file
 * is the story, and what it draws on.
 *
 * A dialog, like every other management surface, because the pane these lived in
 * exists only in the editor view — a control that silently does nothing in the
 * other half of the app is worse than one that is not there.
 */
export function ProjectDialog({
  project,
  files,
  libraries,
  onSave,
  onManageLibraries,
  onReveal,
  onClose
}: ProjectDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(project)
  const [protectionBusy, setProtectionBusy] = useState(false)
  const [protectionMessage, setProtectionMessage] = useState<string | null>(null)

  useEffect(() => setDraft(project), [project.id])

  const dirty =
    draft.title !== project.title ||
    draft.description !== project.description ||
    draft.main !== project.main ||
    draft.protection?.keyId !== project.protection?.keyId

  const patch = (changes: Partial<Project>): void => setDraft({ ...draft, ...changes })

  const close = (): void => {
    if (dirty && !window.confirm('Discard the changes to this project?')) return
    onClose()
  }

  const save = (): void => {
    onSave(draft)
    onClose()
  }

  const linked = libraries.filter((library) => project.libraries.includes(library.id))

  const generateProtection = async (): Promise<void> => {
    setProtectionBusy(true)
    setProtectionMessage(null)
    try {
      const profile = await window.inkcrafter.bundle.generateProtection()
      patch({ protection: profile })
      const installed = await window.inkcrafter.bundle.installProtection(profile)
      setProtectionMessage(installed.message)
    } catch (error) {
      setProtectionMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setProtectionBusy(false)
    }
  }

  const installProtection = async (): Promise<void> => {
    if (!draft.protection) return
    setProtectionBusy(true)
    try {
      setProtectionMessage((await window.inkcrafter.bundle.installProtection(draft.protection)).message)
    } finally {
      setProtectionBusy(false)
    }
  }

  return (
    <Dialog
      title={
        <>
          Project settings
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </>
      }
      ariaLabel="Project settings"
      subtitle={project.path}
      onClose={close}
      footer={
        <>
          <DialogSpacer />
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!dirty}>
            Save
          </Button>
        </>
      }
    >

        <div className="settings-content">
          <Field label="Title">
            <Input value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
          </Field>

          <Field label="Premise" about={copy('project.premise')}>
            <Textarea
              rows={6}
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </Field>

          <Field label="Entry point" about={copy('project.entry')}>
            <Select value={draft.main} onChange={(event) => patch({ main: event.target.value })}>
              {files.length === 0 && <option value={draft.main}>{draft.main}</option>}
              {files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </Select>
          </Field>

          <Field as="div" label="Codex libraries" about={copy('project.libraries')}>
            {linked.length === 0 ? (
              <Hint>This project draws on no libraries yet.</Hint>
            ) : (
              <ul className="linked-libraries">
                {linked.map((library) => (
                  <li key={library.id}>
                    {library.title}
                    <Badge>{library.entryCount}</Badge>
                  </li>
                ))}
              </ul>
            )}

            {/* Managed in one place, so there is no second set of controls to
                disagree with the first. */}
            <Button onClick={onManageLibraries}><Icon name="book-open" size={13} />Manage libraries…</Button>
          </Field>

          <Field
            as="div"
            label="Content protection"
            note="Release exports only. Connected-player previews remain plain and fast."
          >
            {draft.protection ? (
              <>
                <Hint>
                  Protected exports use release key <code>{draft.protection.keyId}</code>. This
                  discourages casual browsing of the installed game; it is not DRM.
                </Hint>
                <div className="dialog-actions-inline">
                  <Button onClick={() => void installProtection()} disabled={protectionBusy}>
                    Install key in player
                  </Button>
                  <Button onClick={() => void generateProtection()} disabled={protectionBusy}>
                    Generate new key
                  </Button>
                  <Button
                    variant="link"
                    onClick={() => {
                      patch({ protection: undefined })
                      setProtectionMessage('Release exports will be plain after this project is saved.')
                    }}
                    disabled={protectionBusy}
                  >
                    Use plain exports
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Hint>Exports are plain files. Generate a release key to encrypt story data and media.</Hint>
                <Button onClick={() => void generateProtection()} disabled={protectionBusy}>
                  {protectionBusy ? 'Generating…' : 'Enable protected exports'}
                </Button>
              </>
            )}
            {protectionMessage && <Hint>{protectionMessage}</Hint>}
          </Field>

          <Field as="div" label="Folder" note={project.path}>
            <Button onClick={onReveal}>
              <Icon name="folder-open" size={13} />
              Open project folder
            </Button>
          </Field>
        </div>
    </Dialog>
  )
}
