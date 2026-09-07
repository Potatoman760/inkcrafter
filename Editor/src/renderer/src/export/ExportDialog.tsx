import { useEffect, useState } from 'react'
import type { BundleExportResult } from '@shared/bundle/result'
import {
  DEFAULT_DESKTOP_RELEASE,
  DESKTOP_PLATFORMS,
  desktopPlatform,
  type DesktopExportResult,
  type DesktopPlatform,
  type DesktopRelease
} from '@shared/desktop'
import type { Project } from '@shared/project'
import {
  Button,
  Checkbox,
  Dialog,
  DialogSpacer,
  Field,
  Hint,
  Input,
  Segmented
} from '../design/components'
import { copy } from '@shared/copy'

interface ExportDialogProps {
  project: Project
  /** Persists the chosen web destination on the project, so it is offered next time. */
  onRemember: (destination: string) => void
  /** Persists the desktop settings — folder, platforms, Steam App ID — the same way. */
  onRememberDesktop: (release: DesktopRelease) => void
  onClose: () => void
}

type Mode = 'web' | 'desktop'

/**
 * Exporting the project, as a bundle a player serves or as a game that runs.
 *
 * The one place the app hands its work to something else, so it says what it
 * did rather than closing on success. Two kinds of bad news, kept apart: a
 * compile error means nothing was written and the story has to be fixed, while
 * a warning means the bundle is there and something in it will not look right.
 * Showing them in one list would make a missing sprite read like a failed build.
 *
 * A desktop export has a third kind: a platform that could not be assembled
 * while the others were. That is reported per platform, beside the folders
 * that were written, because the answer to it is different again — usually a
 * download that did not finish.
 */
export function ExportDialog({
  project,
  onRemember,
  onRememberDesktop,
  onClose
}: ExportDialogProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('web')
  const [destination, setDestination] = useState(project.bundleOut)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BundleExportResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const remembered = project.desktop ?? DEFAULT_DESKTOP_RELEASE
  const [desktopDestination, setDesktopDestination] = useState(remembered.outDir)
  const [platforms, setPlatforms] = useState<DesktopPlatform[]>(remembered.platforms)
  const [steamAppId, setSteamAppId] = useState(
    remembered.steamAppId === null ? '' : String(remembered.steamAppId)
  )
  const [progress, setProgress] = useState<string | null>(null)
  const [desktopResult, setDesktopResult] = useState<DesktopExportResult | null>(null)

  useEffect(
    () => window.inkcrafter.bundle.onDesktopProgress((report) => setProgress(report.message)),
    []
  )

  const choose = async (): Promise<void> => {
    const current = mode === 'web' ? destination : desktopDestination
    const picked = await window.inkcrafter.bundle.chooseDir(current)
    if (picked === null) return
    if (mode === 'web') setDestination(picked)
    else setDesktopDestination(picked)
    setResult(null)
    setDesktopResult(null)
    setFailure(null)
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

  // Blank is "not on Steam"; anything else has to be a whole positive number,
  // because that is the only thing Steam's API will take.
  const appIdText = steamAppId.trim()
  const appIdInvalid = appIdText.length > 0 && !/^[1-9][0-9]*$/.test(appIdText)
  const parsedAppId = appIdText.length > 0 && !appIdInvalid ? Number(appIdText) : null

  const runDesktop = async (): Promise<void> => {
    if (desktopDestination === null || platforms.length === 0 || appIdInvalid) return

    setBusy(true)
    setFailure(null)
    setDesktopResult(null)
    setProgress('Starting…')
    try {
      const next = await window.inkcrafter.bundle.exportDesktop(project, desktopDestination, {
        platforms,
        steamAppId: parsedAppId
      })
      setDesktopResult(next)
      if (next.ok) {
        onRememberDesktop({ outDir: desktopDestination, steamAppId: parsedAppId, platforms })
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const togglePlatform = (id: DesktopPlatform, on: boolean): void => {
    setPlatforms((current) => {
      const without = current.filter((one) => one !== id)
      if (!on) return without
      // Kept in the table's order rather than the order they were ticked, so
      // the folders come out in the same order every time.
      return DESKTOP_PLATFORMS.map((one) => one.id).filter(
        (one) => one === id || without.includes(one)
      )
    })
  }

  const errors = (mode === 'web' ? result : desktopResult)?.diagnostics.filter(
    (d) => d.severity === 'error'
  ) ?? []
  const canRun =
    mode === 'web'
      ? destination !== null
      : desktopDestination !== null && platforms.length > 0 && !appIdInvalid

  return (
    <Dialog
      title="Export"
      ariaLabel="Export"
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
          <Button
            variant="primary"
            onClick={() => void (mode === 'web' ? run() : runDesktop())}
            disabled={busy || !canRun}
          >
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </>
      }
    >
      <Field as="div" label="Export as" about={copy('export.mode')}>
        <Segmented
          label="Export as"
          value={mode}
          onChange={(next) => {
            setMode(next as Mode)
            setFailure(null)
          }}
          options={[
            { value: 'web', label: 'Web bundle' },
            { value: 'desktop', label: 'Desktop game' }
          ]}
        />
      </Field>

      <Field
        as="div"
        label="Destination"
        about={mode === 'web' ? copy('export.destination') : copy('export.desktopDestination')}
      >
        <Hint>{(mode === 'web' ? destination : desktopDestination) ?? 'No folder chosen yet.'}</Hint>
        <Button onClick={() => void choose()} disabled={busy}>
          Choose folder…
        </Button>
      </Field>

      {mode === 'desktop' && (
        <>
          <Field
            as="div"
            label="Platforms"
            about={copy('export.platforms')}
            error={platforms.length === 0 ? 'Choose at least one platform.' : undefined}
          >
            {DESKTOP_PLATFORMS.map((one) => (
              <Checkbox
                key={one.id}
                label={one.label}
                checked={platforms.includes(one.id)}
                onChange={(event) => togglePlatform(one.id, event.currentTarget.checked)}
                disabled={busy}
              />
            ))}
          </Field>

          <Field
            label="Steam App ID"
            about={copy('export.steamAppId')}
            error={appIdInvalid ? 'A Steam App ID is a whole number.' : undefined}
          >
            <Input
              mono
              size="sm"
              inputMode="numeric"
              placeholder="480"
              value={steamAppId}
              invalid={appIdInvalid}
              onChange={(event) => setSteamAppId(event.currentTarget.value)}
              disabled={busy}
            />
          </Field>
        </>
      )}

      <Field
        as="div"
        label="What is written"
        about={mode === 'web' ? copy('export.whatIsWritten') : copy('export.desktopWhatIsWritten')}
      >
        <Hint>
          {project.protection
            ? `Protected release using key ${project.protection.keyId}. The bootstrap remains readable; story, catalogues and media are encrypted.`
            : 'Plain release. Enable content protection in Project settings to obscure the shipped story and media.'}
        </Hint>
        <ul className="linked-libraries">
          {mode === 'desktop' ? (
            <>
              <li>One folder per platform — the game, the player and Electron, ready to run</li>
              <li>README.txt — how to launch each, and what a Mac build still needs</li>
              <li>The bundle inside each, {project.protection ? 'protected' : 'plain'}, exactly as a web export would write it</li>
            </>
          ) : project.protection ? (
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

      {busy && progress !== null && <Hint>{progress}</Hint>}

      {failure !== null && <p className="settings-error">{failure}</p>}

      {errors.length > 0 && (
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

      {mode === 'web' && result !== null && !result.ok && errors.length === 0 && (
        <p className="settings-error">{result.warnings.join(' ')}</p>
      )}

      {mode === 'web' && result?.ok === true && (
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

      {mode === 'desktop' && desktopResult !== null && !desktopResult.ok && errors.length === 0 && (
        // A refusal can be the tail of a build that failed, which has lines.
        <p className="settings-error" style={{ whiteSpace: 'pre-wrap' }}>
          {desktopResult.warnings.join('\n')}
        </p>
      )}

      {mode === 'desktop' && desktopResult?.ok === true && (
        <Field
          as="div"
          label="Exported"
          note={
            <>
              {desktopResult.builds.filter((one) => one.outDir !== null).length} of{' '}
              {desktopResult.builds.length} platform(s)
            </>
          }
        >
          <ul className="linked-libraries">
            {desktopResult.builds.map((build) => (
              <li key={build.platform}>
                {desktopPlatform(build.platform).label} —{' '}
                {build.outDir !== null ? build.outDir : `not written: ${build.problem}`}
              </li>
            ))}
            {desktopResult.warnings.map((warning, index) => (
              <li key={`warning-${index}`}>{warning}</li>
            ))}
          </ul>
          <Button onClick={() => void window.inkcrafter.bundle.reveal(desktopResult.outDir)}>
            Show the folder
          </Button>
        </Field>
      )}
    </Dialog>
  )
}
