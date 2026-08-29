import { useCallback, useEffect, useState } from 'react'
import {
  COMFY_DEFAULT_BASE_URL,
  normaliseComfyUrl,
  ROLE_LABELS,
  type BindingSlot,
  type ComfyTestResult,
  type NodeField,
  type WorkflowListResult,
  type WorkflowRole
} from '@shared/comfy'
import type { Settings } from './useSettings'
import { BindingEditor } from './BindingEditor'
import { Badge, Button, Field, Hint, Input, ListRow, StatusPill } from '../design/components'
import { copy } from '@shared/copy'

/**
 * The author's own ComfyUI: where it is, which workflows to run, and what each
 * of them binds to.
 *
 * Three things have to be true before the assistant can draw anything, and they
 * fail separately: ComfyUI has to be running, the folder has to hold API-format
 * exports, and each workflow has to have somewhere to put a prompt. So each has
 * its own row and its own answer, rather than one "connected" light that could
 * mean any of them.
 *
 * No key anywhere. ComfyUI has no authentication, which is also why the default
 * address is loopback — on that port, anything on the machine can reach it.
 */
export function ComfyUiTab({ settings }: { settings: Settings }): React.JSX.Element {
  const comfy = settings.settings.comfy

  const [test, setTest] = useState<ComfyTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [list, setList] = useState<WorkflowListResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // The address is typed rather than chosen, so it is held locally and
  // committed on blur or Enter. Saving per keystroke would refuse "http://1"
  // on the way to something valid.
  const [url, setUrl] = useState(comfy.baseUrl)
  useEffect(() => setUrl(comfy.baseUrl), [comfy.baseUrl])

  /**
   * Everything main consults when it builds the list.
   *
   * All three have to be here. Watching only the corrections was why the
   * Creates/Edits switch wrote to disk and then sat there unchanged: the
   * setting was saved, the list was never asked for again, and the control
   * looked dead while working perfectly.
   */
  const inputs = JSON.stringify([comfy.overrides, comfy.roles, comfy.defaults])

  const reload = useCallback(async (): Promise<void> => {
    setList(await window.inkcrafter.comfy.workflows())
  }, [])

  // Main is where the graphs are parsed, so anything that changes how one reads
  // has to come back from there rather than being patched up here.
  useEffect(() => {
    void reload()
  }, [reload, comfy.workflowDir, inputs])

  const workflows = list?.workflows ?? []
  const current = workflows.find((one) => one.file === selected) ?? workflows[0] ?? null

  const commitUrl = (): void => {
    if (url.trim() !== comfy.baseUrl) void settings.setComfyBaseUrl(url)
  }

  const runTest = (): void => {
    setTesting(true)
    setTest(null)
    void window.inkcrafter.comfy
      .test()
      .then(setTest)
      .finally(() => setTesting(false))
  }

  const choose = async (): Promise<void> => {
    const chosen = await window.inkcrafter.comfy.chooseDir()
    if (chosen !== null) await settings.setComfyWorkflowDir(chosen)
  }

  const set = (slot: BindingSlot, at: NodeField | null): void => {
    if (current) void settings.setComfyBinding(current.file, slot, at)
  }

  const clear = (slot: BindingSlot): void => {
    if (current) void settings.clearComfyBinding(current.file, slot)
  }

  const setRole = (role: WorkflowRole | null): void => {
    if (current) void settings.setComfyRole(current.file, role)
  }

  const setDefault = (isDefault: boolean): void => {
    // Unticking hands the role back to "the first of that kind", which may well
    // be this one again — so it is a choice being forgotten, not one being made.
    if (current) void settings.setComfyDefault(current.role, isDefault ? current.file : null)
  }

  const setPromptPrefix = (prefix: string | null): void => {
    if (current) void settings.setComfyPromptPrefix(current.file, prefix)
  }

  const typed = normaliseComfyUrl(url)

  return (
    <div className="comfy-tab">
      <Hint tight>
        A ComfyUI running on this machine draws the pictures the assistant asks for, straight into
        the open project&apos;s <code>media/</code>. Requests are made from the app&apos;s main
        process, never from the editor window.
      </Hint>

      {settings.error && <p className="codex-error">{settings.error}</p>}

      <Field as="div" label="Server" about={copy('comfy.baseUrl')}>
        <div className="detail-row">
          <Input
            className="comfy-url"
            mono
            value={url}
            placeholder={COMFY_DEFAULT_BASE_URL}
            aria-label="ComfyUI address"
            onChange={(event) => setUrl(event.target.value)}
            onBlur={commitUrl}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitUrl()
            }}
          />
          <Button icon="plug" disabled={testing} onClick={runTest}>
            {testing ? 'Testing…' : 'Test'}
          </Button>
          <StatusPill
            state={test === null ? 'idle' : test.ok ? 'ok' : 'error'}
            className="comfy-status"
          >
            {test === null ? 'Not tried' : test.ok ? 'Answered' : 'No answer'}
          </StatusPill>
        </div>

        {typed.problem !== null && url.trim().length > 0 && (
          <Hint tone="error">{typed.problem}</Hint>
        )}
        {/* Proof it reached the machine they meant, not merely that something
            was listening on that port. */}
        {test?.ok && test.device && <Hint tight>{test.device}</Hint>}
        {test !== null && !test.ok && <Hint tone="error">{test.message}</Hint>}
      </Field>

      <Field
        as="div"
        label="Workflow folder"
        about={copy('comfy.workflowDir')}
      >
        <div className="detail-row">
          <Input
            className="comfy-path"
            mono
            readOnly
            value={comfy.workflowDir ?? ''}
            placeholder="No folder chosen yet"
            aria-label="Workflow folder"
          />
          <Button icon="folder-open" onClick={() => void choose()}>
            Choose…
          </Button>
          {comfy.workflowDir && (
            <Button variant="link" onClick={() => void settings.setComfyWorkflowDir(null)}>
              forget
            </Button>
          )}
        </div>

        {list !== null && !list.ok && <Hint tone="error">{list.message}</Hint>}
      </Field>

      <Field as="div" label="Give up after" about={copy('comfy.timeout')}>
        <Input
          className="comfy-timeout"
          type="number"
          min={30}
          max={1800}
          defaultValue={comfy.timeoutSeconds}
          aria-label="Seconds before giving up"
          onBlur={(event) => void settings.setComfyTimeout(Number(event.target.value))}
        />
      </Field>

      {workflows.length > 0 && (
        <div className="comfy-layout">
          <div className="comfy-list">
            {workflows.map((one) => (
              <ListRow
                key={one.file}
                name={one.name}
                selected={one.file === current?.file}
                meta={ROLE_LABELS[one.role]}
                trail={
                  one.problem !== null ? (
                    <Badge title={one.problem}>unreadable</Badge>
                  ) : one.bindings.positive === null ? (
                    <Badge title="Nowhere to put a prompt">no prompt</Badge>
                  ) : one.isDefault ? (
                    <Badge title={`Used when the assistant asks for something to ${one.role === 'edits' ? 'edit' : 'draw'} and names no workflow`}>
                      default
                    </Badge>
                  ) : Object.keys(one.override).length > 0 ? (
                    <Badge title="Some bindings were set by hand">edited</Badge>
                  ) : undefined
                }
                onClick={() => setSelected(one.file)}
              />
            ))}
          </div>

          {current && (
            <BindingEditor
              workflow={current}
              // Tolerate a settings payload from a main process that predates
              // this field; useSettings hydrates it too, but this is the render
              // boundary whose failure used to blank the whole window.
              promptPrefix={comfy.promptPrefixes?.[current.file] ?? ''}
              onSet={set}
              onClear={clear}
              onRole={setRole}
              onDefault={setDefault}
              onPromptPrefix={setPromptPrefix}
              siblings={workflows.filter((one) => one.role === current.role).length}
            />
          )}
        </div>
      )}
    </div>
  )
}
