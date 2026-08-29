import { useEffect, useState } from 'react'
import type { ConnectionTestResult, Provider } from '@shared/settings'
import { ModelPicker } from './ModelPicker'
import type { Settings } from './useSettings'
import { Icon } from '../design/Icon'
import { Badge, Button, Field, Hint, Input, ListRow } from '../design/components'
import { copy } from '@shared/copy'

interface AiProvidersTabProps {
  settings: Settings
}

export function AiProvidersTab({ settings }: AiProvidersTabProps): React.JSX.Element {
  const { settings: current, updateProvider, setActive, addProvider, deleteProvider } = settings

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [test, setTest] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)

  const selected =
    current.providers.find((provider) => provider.id === selectedId) ?? current.providers[0] ?? null

  // Clear per-provider transient state when the selection moves.
  useEffect(() => {
    setKeyDraft('')
    setTest(null)
  }, [selected?.id])

  const patch = (changes: Partial<Provider>): void => {
    if (selected) updateProvider({ ...selected, ...changes })
  }

  const submitNew = (): void => {
    const label = newLabel.trim()
    if (label.length === 0) return
    void addProvider(label).then((provider) => {
      if (provider) setSelectedId(provider.id)
    })
    setNewLabel('')
  }

  const saveKey = (): void => {
    if (!selected) return
    void settings.setApiKey(selected.id, keyDraft.length > 0 ? keyDraft : null)
    setKeyDraft('')
  }

  const runTest = (): void => {
    if (!selected) return
    setTesting(true)
    setTest(null)
    void settings
      .testProvider(selected.id)
      .then(setTest)
      .finally(() => setTesting(false))
  }

  return (
    <div className="settings-tab">
      <Hint tight>
        Any API that speaks the OpenAI protocol — OpenAI itself, OpenRouter, a local Ollama or
        llama.cpp. Requests are made from the app's main process, never from the editor window.
      </Hint>

      {!current.encryptionAvailable && (
        <p className="codex-warning">
          The OS keystore is unavailable on this machine, so API keys cannot be stored securely.
          Saving a key will be refused rather than written in cleartext.
        </p>
      )}

      {settings.error && <p className="codex-error">{settings.error}</p>}

      <div className="provider-layout">
        <div className="provider-list">
          {current.providers.length === 0 && <Hint>No providers yet.</Hint>}

          {current.providers.map((provider) => (
            <ListRow
              key={provider.id}
              name={provider.label}
              selected={provider.id === selected?.id}
              trail={
                provider.id === current.activeProviderId && (
                  <Badge title="Used for requests">active</Badge>
                )
              }
              onClick={() => setSelectedId(provider.id)}
            />
          ))}

          <div className="detail-row">
            <Input
              value={newLabel}
              aria-label="New provider"
              placeholder="Name"
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitNew()
              }}
            />
            <Button onClick={submitNew} disabled={newLabel.trim().length === 0}>
              <Icon name="plus" size={13} />
              Add
            </Button>
          </div>
        </div>

        {selected ? (
          <div className="provider-editor">
            <Field label="Name">
              <Input
                value={selected.label}
                onChange={(event) => patch({ label: event.target.value })}
              />
            </Field>

            <Field label="Base URL" about={copy('provider.baseUrl')}>
              <Input
                value={selected.baseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => patch({ baseUrl: event.target.value })}
              />
            </Field>

            <Field as="div" label="Model" about={copy('provider.model')}>
              <ModelPicker
                providerId={selected.id}
                baseUrl={selected.baseUrl}
                value={selected.model}
                onChange={(model) => patch({ model })}
                listModels={settings.listModels}
              />
            </Field>

            <Field label="API key" note={copy(selected.hasKey ? 'provider.apiKey.set' : 'provider.apiKey.unset')}>
              <div className="detail-row">
                <Input
                  type="password"
                  value={keyDraft}
                  placeholder={selected.hasKey ? '••••••••  (unchanged)' : 'sk-…'}
                  autoComplete="off"
                  onChange={(event) => setKeyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveKey()
                  }}
                />
                <Button onClick={saveKey} disabled={keyDraft.length === 0}>
                  Save key
                </Button>
              </div>
            </Field>
            <Hint tight>
              A saved key is encrypted with the OS keystore and is never sent back to this window,
              which is why it cannot be shown here. Leave blank to keep the current one.
            </Hint>
            {selected.hasKey && (
              <button
                className="link-button provider-clear"
                onClick={() => void settings.setApiKey(selected.id, null)}
              >
                Remove the stored key
              </button>
            )}

            <div className="detail-row provider-actions">
              <Button onClick={runTest} disabled={testing}>
                <Icon name="plug" size={13} />
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
              <Button
                onClick={() => setActive(selected.id)}
                disabled={selected.id === current.activeProviderId}
              >
                Make active
              </Button>
            </div>

            {test && (
              <p className={test.ok ? 'provider-test-ok' : 'provider-test-fail'}>
                {test.status !== null && `${test.status} · `}
                {test.message}
              </p>
            )}

            <Button variant="danger" onClick={() => void deleteProvider(selected.id)}>
              Delete provider
            </Button>
          </div>
        ) : (
          <Hint className="pad">Add a provider to get started.</Hint>
        )}
      </div>
    </div>
  )
}
