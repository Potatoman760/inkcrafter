import { useEffect, useState } from 'react'
import type { CodexLibrary, Project } from '@shared/project'
import type { PackageResult } from '@shared/projectPackage'
import { Badge, Button, Checkbox, Dialog, DialogSpacer, Field, Hint } from '../design/components'
import { copy } from '@shared/copy'

interface PackageDialogProps {
  project: Project
  onClose: () => void
}

/**
 * Packaging a project to hand to somebody, or to move to another machine.
 *
 * The libraries are the whole reason this exists. A project's folder is not
 * the project: the codex it draws on lives beside it, shared with whatever
 * else uses it, so copying the project folder alone produces a story whose
 * every mention resolves to nothing. So the libraries are listed here, the
 * linked ones already ticked, and one that is unticked while the project links
 * it says so rather than going quietly.
 */
export function PackageDialog({ project, onClose }: PackageDialogProps): React.JSX.Element {
  const [libraries, setLibraries] = useState<CodexLibrary[]>([])
  const [chosen, setChosen] = useState<string[]>(project.libraries)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PackageResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    window.inkcrafter.libraries
      .list()
      .then(setLibraries)
      .catch((cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)))
  }, [])

  const linked = new Set(project.libraries)
  const here = new Set(libraries.map((one) => one.id))
  // Two different problems that both end as "a linked library is not going in".
  // One the author just did by unticking a box, and one that was already true
  // of the project before this dialog opened — blaming them for the second
  // would send them looking for a box that is not there.
  const untickedIds = project.libraries.filter((id) => here.has(id) && !chosen.includes(id))
  const strayIds = project.libraries.filter((id) => !here.has(id))

  const toggle = (id: string, on: boolean): void => {
    setChosen((current) => (on ? [...current, id] : current.filter((one) => one !== id)))
    setResult(null)
  }

  const run = async (): Promise<void> => {
    setFailure(null)
    const file = await window.inkcrafter.packages.choosePath(project)
    if (file === null) return

    setBusy(true)
    setResult(null)
    try {
      // The order the workspace lists them in, not the order they were ticked,
      // so packaging the same project twice produces the same manifest.
      const ids = libraries.filter((one) => chosen.includes(one.id)).map((one) => one.id)
      setResult(await window.inkcrafter.packages.write(project, ids, file))
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Package project"
      ariaLabel="Package project"
      className="entry-dialog"
      onClose={onClose}
      closable={!busy}
      footer={
        <>
          <DialogSpacer />
          <Button onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Packaging…' : 'Choose a file and package'}
          </Button>
        </>
      }
    >
      <Field as="div" label="What is written" about={copy('package.whatIsWritten')}>
        <Hint>
          {project.title}, and the codex libraries ticked below. Anything the project generates
          on the way to a game is left out.
        </Hint>
      </Field>

      <Field
        as="div"
        label="Codex libraries"
        about={copy('package.libraries')}
        error={
          untickedIds.length > 0
            ? `${count(untickedIds.length)} this project links will not be in the package.`
            : undefined
        }
      >
        {libraries.length === 0 && <Hint>No codex libraries in this workspace.</Hint>}
        {strayIds.length > 0 && (
          <Hint>
            This project links {count(strayIds.length)} that this workspace does not have.
            {strayIds.length === 1 ? ' It cannot' : ' They cannot'} go in the package.
          </Hint>
        )}
        {libraries.map((library) => (
          <Checkbox
            key={library.id}
            label={library.title}
            trail={linked.has(library.id) ? <Badge>linked</Badge> : undefined}
            checked={chosen.includes(library.id)}
            onChange={(event) => toggle(library.id, event.currentTarget.checked)}
            disabled={busy}
          />
        ))}
      </Field>

      {failure !== null && <p className="settings-error">{failure}</p>}

      {result !== null && !result.ok && (
        <p className="settings-error">{result.problem ?? 'Nothing was written.'}</p>
      )}

      {result?.ok === true && (
        <Field as="div" label="Packaged" note={`${result.files} file(s), ${megabytes(result.bytes)}`}>
          <Hint>{result.file}</Hint>
          {result.warnings.length > 0 && (
            <ul className="linked-libraries">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <Button onClick={() => void window.inkcrafter.bundle.reveal(folderOf(result.file))}>
            Show the folder
          </Button>
        </Field>
      )}
    </Dialog>
  )
}

/** "1 library" or "3 libraries", since both readings turn up here. */
function count(many: number): string {
  return `${many} librar${many === 1 ? 'y' : 'ies'}`
}

/** A size somebody can judge a transfer by, which bytes are not. */
function megabytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The folder a file is in, either separator, so revealing it opens somewhere. */
function folderOf(file: string): string {
  const at = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'))
  return at <= 0 ? file : file.slice(0, at)
}
