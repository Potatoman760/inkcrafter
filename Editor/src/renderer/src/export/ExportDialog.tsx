import { useState } from 'react'
import type { BundleExportResult } from '@shared/bundle/result'
import type { Project } from '@shared/project'
import { Button, Dialog, DialogSpacer, Field, Hint } from '../design/components'
import { copy } from '@shared/copy'

interface ExportDialogProps {
  project: Project
  /** Persists the chosen destination on the project, so it is offered next time. */
  onRemember: (destination: string) => void
  onClose: () => void
}

/**
 * Exporting the project as a bundle a game can play.
 *
 * The one place the app hands its work to something else, so it says what it
 * did rather than closing on success. Two kinds of bad news, kept apart: a
 * compile error means nothing was written and the story has to be fixed, while
 * a warning means the bundle is there and something in it will not look right.
 * Showing them in one list would make a missing sprite read like a failed build.
 */
export function ExportDialog({
  project,
  onRemember,
  onClose
}: ExportDialogProps): React.JSX.Element {
  const [destination, setDestination] = useState(project.bundleOut)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BundleExportResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const choose = async (): Promise<void> => {
    const picked = await window.inkcrafter.bundle.chooseDir(destination)
    if (picked !== null) {
      setDestination(picked)
      setResult(null)
      setFailure(null)
    }
  }

  const run = async (): Promise<void> => {
    if (destination === null) return

    setBusy(true)
    setFailure(null)
    try {
      const next = await window.inkcrafter.bundle.export(project, destination)
      setResult(next)
      // Remembered only on success: pointing the project at a folder that
      // refused the export would offer the same wrong answer next time.
      if (next.ok) onRemember(destination)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const errors = result?.diagnostics.filter((d) => d.severity === 'error') ?? []

  return (
    <Dialog
      title="Export for player"
      ariaLabel="Export bundle"
      className="entry-dialog"
      onClose={onClose}
      // A half-written bundle is worse than none, so the scrim, Escape and the
      // close button all stop working while the export is running.
      closable={!busy}
      footer={
        <>
          {/* Destructive far left, then the way out, then the commit. */}
          <DialogSpacer />
          <Button onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy || !destination}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </>
      }
    >
      <Field as="div" label="Destination" about={copy('export.destination')}>
        <Hint>{destination ?? 'No folder chosen yet.'}</Hint>
        <Button onClick={() => void choose()} disabled={busy}>
          Choose folder…
        </Button>
      </Field>

      <Field as="div" label="What is written" about={copy('export.whatIsWritten')}>
        <Hint>
          {project.protection
            ? `Protected release using key ${project.protection.keyId}. The bootstrap remains readable; story, catalogues and media are encrypted.`
            : 'Plain release. Enable content protection in Project settings to obscure the shipped story and media.'}
        </Hint>
        <ul className="linked-libraries">
          {project.protection ? (
            <>
              <li>manifest.json — protected-bundle bootstrap and wrapped content key</li>
              <li>content/*.icp — encrypted story, catalogues, pictures, audio and clips</li>
            </>
          ) : (
            <>
              <li>story.json — compiled ink, INCLUDEs resolved</li>
              <li>catalogue.json — stats, hidden vars and items</li>
              <li>media.json + media/ — every catalogued picture and clip</li>
              <li>gallery.json — unlockable background and animation groups</li>
              <li>achievements.json — Steam unlock conditions over Ink variables</li>
              <li>manifest.json — what the player reads first</li>
            </>
          )}
        </ul>
      </Field>

      {failure !== null && <p className="settings-error">{failure}</p>}

      {result !== null && errors.length > 0 && (
        <Field as="div" label="The story did not compile" note={copy('export.nothingWritten')}>
          <ul className="linked-libraries">
            {errors.map((diagnostic, index) => (
              <li key={index}>
                {diagnostic.line === null ? '' : `line ${diagnostic.line}: `}
                {diagnostic.message}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {result !== null && !result.ok && errors.length === 0 && (
        <p className="settings-error">{result.warnings.join(' ')}</p>
      )}

      {result?.ok === true && (
        <Field
          as="div"
          label="Exported"
          note={
            <>
              {result.manifest?.assets.length ?? 0} media file(s),{' '}
              {result.manifest?.knots.length ?? 0} knot(s)
            </>
          }
        >
          {result.warnings.length > 0 && (
            <ul className="linked-libraries">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <Button onClick={() => void window.inkcrafter.bundle.reveal(result.outDir)}>
            Show the folder
          </Button>
        </Field>
      )}
    </Dialog>
  )
}
