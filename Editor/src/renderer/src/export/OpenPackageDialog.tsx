import { useEffect, useState } from 'react'
import type { PackageImportResult, PackagePreview } from '@shared/projectPackage'
import { Button, Dialog, DialogSpacer, Field, Hint } from '../design/components'
import { copy } from '@shared/copy'

interface OpenPackageDialogProps {
  /** Called with the unpacked project's folder, so the app can open it. */
  onOpened: (projectPath: string) => void
  onClose: () => void
}

/**
 * Opening a package somebody sent, or one this workspace wrote.
 *
 * Two steps rather than one. Unpacking writes into the workspace, and what it
 * will do there is not always what the sender's workspace looked like: a
 * folder name may be taken, a codex library may already be here under the same
 * id and stay untouched. All of that is knowable before anything is written,
 * so it is said first and the author agrees to it — which is the difference
 * between a surprise and a decision.
 */
export function OpenPackageDialog({
  onOpened,
  onClose
}: OpenPackageDialogProps): React.JSX.Element {
  const [preview, setPreview] = useState<PackagePreview | null>(null)
  const [result, setResult] = useState<PackageImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const choose = async (): Promise<void> => {
    setFailure(null)
    setResult(null)
    setBusy(true)
    try {
      const file = await window.inkcrafter.packages.choose()
      // Cancelling the native dialog closes this one: it exists to pick a
      // package, and there is nothing to look at without one.
      if (file === null) {
        onClose()
        return
      }
      setPreview(await window.inkcrafter.packages.preview(file))
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // The file dialog opens with this one, rather than behind a button that says
  // "choose a file" in a dialog the author opened to choose a file.
  useEffect(() => {
    void choose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const open = async (): Promise<void> => {
    if (!preview?.ok) return
    setBusy(true)
    setFailure(null)
    try {
      const next = await window.inkcrafter.packages.open(preview.file)
      setResult(next)
      // Kept open on success only long enough to say what it did; the caller
      // decides when to leave, because it is the thing that opens the project.
      if (next.ok && next.projectPath !== null && next.warnings.length === 0) {
        onOpened(next.projectPath)
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const manifest = preview?.manifest ?? null

  return (
    <Dialog
      title="Open a package"
      ariaLabel="Open a package"
      className="entry-dialog"
      onClose={onClose}
      closable={!busy}
      footer={
        <>
          <DialogSpacer />
          <Button onClick={onClose} disabled={busy}>
            Close
          </Button>
          {result?.ok === true && result.projectPath !== null ? (
            <Button variant="primary" onClick={() => onOpened(result.projectPath!)}>
              Open the project
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void open()}
              disabled={busy || preview?.ok !== true}
            >
              {busy ? 'Working…' : 'Put it in the workspace'}
            </Button>
          )}
        </>
      }
    >
      {busy && preview === null && <Hint>Reading the package…</Hint>}

      {failure !== null && <p className="settings-error">{failure}</p>}

      {preview !== null && !preview.ok && (
        <p className="settings-error">{preview.problem ?? 'That is not a project package.'}</p>
      )}

      {manifest !== null && result === null && (
        <>
          <Field as="div" label="Project" about={copy('package.landing')}>
            <Hint>{manifest.project.title}</Hint>
            <ul className="linked-libraries">
              <li>
                Lands in the workspace as <code>{preview?.folder}</code>
                {preview?.folder !== manifest.project.folder &&
                  `, because "${manifest.project.folder}" is taken`}
              </li>
              {preview?.duplicate === true && (
                <li>
                  This project is already in the workspace, so the copy is given its own identity
                  and both can be opened.
                </li>
              )}
            </ul>
          </Field>

          <Field as="div" label="Codex libraries" about={copy('package.incomingLibraries')}>
            {preview?.libraries.length === 0 && <Hint>None — the package holds only the project.</Hint>}
            <ul className="linked-libraries">
              {preview?.libraries.map((library) => (
                <li key={library.id}>
                  {library.title} —{' '}
                  {library.fate === 'add'
                    ? 'added to the workspace'
                    : `already here${library.existingTitle === null ? '' : ` as "${library.existingTitle}"`}, so yours is kept`}
                </li>
              ))}
            </ul>
          </Field>
        </>
      )}

      {result !== null && !result.ok && (
        <p className="settings-error">{result.problem ?? 'Nothing was opened.'}</p>
      )}

      {result?.ok === true && (
        <Field as="div" label="In the workspace" note={result.projectPath ?? ''}>
          <ul className="linked-libraries">
            {result.libraries.map((library, index) => (
              <li key={index}>
                {library.title} — {library.fate === 'add' ? 'added' : 'already here, yours kept'}
              </li>
            ))}
            {result.warnings.map((warning, index) => (
              <li key={`warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </Field>
      )}
    </Dialog>
  )
}
