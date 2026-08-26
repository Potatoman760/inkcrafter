import { useCallback, useEffect, useState } from 'react'
import type { PlayerCheck, PlayerStatus } from '@shared/player'
import type { Settings } from './useSettings'
import { Button, Field, Hint, Input, StatusPill } from '../design/components'
import { copy } from '@shared/copy'

/**
 * Where the InkCrafter Player lives, and whether it is running.
 *
 * The player is a separate checkout — a vite app that serves the bundles in its
 * `game/` folder — so all this holds is a path to it and the state of the dev
 * server the app starts there. The folder is checked rather than trusted:
 * pointing at the wrong one, or at the right one that was never installed, are
 * the two things that actually happen, and both otherwise surface as a page of
 * npm output.
 */
export function ConnectedPlayerTab({ settings }: { settings: Settings }): React.JSX.Element {
  const dir = settings.settings.playerDir
  const [check, setCheck] = useState<PlayerCheck | null>(null)
  const [status, setStatus] = useState<PlayerStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setStatus(await window.inkcrafter.player.status())
    setCheck(dir ? await window.inkcrafter.player.check(dir) : null)
  }, [dir])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The server's life is longer than this dialog's, and it changes on its own —
  // it takes seconds to boot and can stop without being asked.
  useEffect(() => {
    const timer = setInterval(() => void window.inkcrafter.player.status().then(setStatus), 1000)
    return () => clearInterval(timer)
  }, [])

  const choose = async (): Promise<void> => {
    const chosen = await window.inkcrafter.player.choose()
    if (chosen === null) return
    await settings.setPlayerDir(chosen)
  }

  const stop = async (): Promise<void> => {
    setBusy(true)
    setStatus(await window.inkcrafter.player.stop())
    setBusy(false)
  }

  const failed = status !== null && !status.running && status.exitCode !== null

  return (
    <div className="player-tab">
      <Field
        as="div"
        label="Player folder"
        about={copy('player.dir')}
      >
        <div className="detail-row">
          <Input
            className="player-path"
            mono
            readOnly
            value={dir ?? ''}
            placeholder="No folder chosen yet"
            aria-label="Player folder"
          />
          <Button icon="folder-open" onClick={() => void choose()}>
            Choose…
          </Button>
          {dir && (
            <Button variant="link" onClick={() => void settings.setPlayerDir(null)}>
              forget
            </Button>
          )}
        </div>

        {check && !check.ok && <Hint tone="error">{check.problem}</Hint>}
        {check?.ok && (
          <Hint tight>
            Found <code>{check.name ?? 'the player'}</code>. Previewing writes the bundle to{' '}
            <code>game/preview</code> there and serves it.
          </Hint>
        )}
      </Field>

      <Field as="div" label="Dev server" about={copy('player.server')}>
        <div className="detail-row">
          <StatusPill
            state={status?.running ? 'ok' : failed ? 'error' : 'idle'}
            className="player-status"
          >
            {status?.running ? 'Running' : failed ? `Stopped (${status.exitCode})` : 'Not running'}
          </StatusPill>

          {status?.url && (
            <Button variant="link" onClick={() => void window.inkcrafter.player.open()}>
              {status.url}
            </Button>
          )}

          {status?.running && (
            <Button variant="link" disabled={busy} onClick={() => void stop()}>
              stop
            </Button>
          )}
        </div>

        {/* Only when it went wrong. A dev server's ordinary output is noise, and
            a pane of it sitting there permanently reads as something to read. */}
        {failed && status.lines.length > 0 && (
          <pre className="player-log">{status.lines.slice(-12).join('\n')}</pre>
        )}
      </Field>
    </div>
  )
}
