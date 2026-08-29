import { useState } from 'react'
import { AiProvidersTab } from './AiProvidersTab'
import { ComfyUiTab } from './ComfyUiTab'
import { PromptsTab } from './PromptsTab'
import { AppearanceTab } from './AppearanceTab'
import { useSettings } from './useSettings'
import { Dialog, Hint, ListRow } from '../design/components'

interface SettingsDialogProps {
  onClose: () => void
}

type Tab = 'appearance' | 'providers' | 'comfy' | 'prompts'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'providers', label: 'AI providers' },
  { id: 'comfy', label: 'ComfyUI' },
  { id: 'prompts', label: 'Prompts' }
]

/**
 * Application settings, as opposed to the project settings in the right-hand
 * pane. An overlay in the same window rather than a second BrowserWindow, which
 * would need its own preload and content security policy for no gain.
 */
export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('appearance')
  const settings = useSettings(true)

  return (
    <Dialog
      title="Settings"
      onClose={onClose}
      // The rail and the pane beside it bring their own padding.
      flush
      // Each setting saves as it is changed, so there is no dialog-wide action
      // and no footer — the header's close is the way out.
    >
      <div className="settings-body">
        <nav className="settings-rail">
          {TABS.map((candidate) => (
            <ListRow
              key={candidate.id}
              name={candidate.label}
              selected={tab === candidate.id}
              onClick={() => setTab(candidate.id)}
            />
          ))}
        </nav>

        <div className="settings-content">
          {settings.loading && <Hint>Loading…</Hint>}
          {!settings.loading && tab === 'appearance' && <AppearanceTab settings={settings} />}
          {!settings.loading && tab === 'providers' && <AiProvidersTab settings={settings} />}
          {!settings.loading && tab === 'comfy' && <ComfyUiTab settings={settings} />}
          {!settings.loading && tab === 'prompts' && <PromptsTab settings={settings} />}
        </div>
      </div>
    </Dialog>
  )
}
