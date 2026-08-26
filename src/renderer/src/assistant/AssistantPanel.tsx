import { useEffect, useRef, useState } from 'react'
import {
  MAX_TOOL_ROUNDS,
  type ChatContext,
  type ChatMessage,
  type ChatToolCall
} from '@shared/chat'
import { ModelPicker } from '../settings/ModelPicker'
import { useSettings } from '../settings/useSettings'
import type { AssistantSession } from './useAssistant'
import { Icon } from '../design/Icon'
import { Button, Chip, ChipRow, EmptyState, Textarea } from '../design/components'
import type { CodexEntry } from '@shared/codex'
import { selectCodexEntries } from '@shared/codexContext'

interface AssistantPanelProps {
  assistant: AssistantSession
  /** Where the author is working, so the assistant can start there. */
  projectPath: string | null
  projectTitle: string | null
  /** Where the author is, sent with every turn. */
  context?: ChatContext
  /** Entries and visible prose used to preview the codex context sent with a turn. */
  codexEntries?: CodexEntry[]
  contextText?: string
  /** The dock has just opened this panel, so release stale editor focus. */
  takeFocus?: boolean
  /** Flushes the editor buffer before tools read or replace files on disk. */
  onBeforeSend?: () => Promise<void>
  /** Called with the workspace-relative paths written, so the app can reload. */
  onFilesWritten: (paths: string[]) => void
}

const SUGGESTIONS = [
  'Create a new project called The Signal, with 5 chapters, and seed each chapter with an ink file.',
  'List what is in my workspace.',
  'Add a codex library for this project with its three main characters.'
]

/**
 * The assistant, in the right-hand dock.
 *
 * It was a dialog, for the reason the codex editor and the library manager are
 * one: a pane belongs to one view, and a control that opens one is silently dead
 * in the others. That answer cost the app's most capable feature its presence —
 * asking it something meant covering the thing you were asking about.
 *
 * The dock solves the same problem the other way. This tab is in every view's
 * strip, so there is no view it can be dead in, and the session lives in `App`
 * rather than here — switching views does not interrupt a turn or lose what it
 * has already said.
 */
export function AssistantPanel({
  assistant,
  projectPath,
  projectTitle,
  context,
  codexEntries = [],
  contextText = '',
  takeFocus = false,
  onBeforeSend,
  onFilesWritten
}: AssistantPanelProps): React.JSX.Element {
  const settings = useSettings(true)
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [input, setInput] = useState('')
  const [contextOpen, setContextOpen] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (providerId || settings.settings.providers.length === 0) return
    const active =
      settings.settings.providers.find((p) => p.id === settings.settings.activeProviderId) ??
      settings.settings.providers[0]!
    setProviderId(active.id)
    setModel(active.model)
  }, [settings.settings, providerId])

  // Follow the conversation down as it grows, including while tools are running.
  useEffect(() => {
    const element = transcriptRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [assistant.messages, assistant.busy])

  const provider = settings.settings.providers.find((candidate) => candidate.id === providerId)
  const ready = Boolean(provider && model)
  const codex = selectCodexEntries([contextText, context?.selection ?? '', input].join('\n\n'), codexEntries)

  useEffect(() => {
    if (!takeFocus || !ready) return

    // CodeMirror can remain Chromium's active focus owner after its dock is
    // replaced. In Electron that stale contenteditable sometimes refuses to
    // yield to the prompt until the whole window blurs. Do that handoff here,
    // then focus after the newly mounted panel has completed layout.
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== inputRef.current) active.blur()
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [takeFocus, ready])

  const sentContext = (): ChatContext | undefined =>
    context
      ? {
          ...context,
          ...(codex.entries.length > 0
            ? {
                codexEntryIds: codex.entries.map((entry) => entry.id),
                detectedCodexEntryIds: [...codex.detected]
              }
            : {})
        }
      : undefined

  const submit = async (text: string): Promise<void> => {
    if (!ready || assistant.busy) return
    await onBeforeSend?.()
    setInput('')
    const written = await assistant.send(text, {
      providerId,
      model,
      projectPath,
      context: sentContext()
    })
    if (written.length > 0) onFilesWritten(written)
  }

  return (
    <div className="assistant-panel" aria-label="Assistant">
    <div className="assistant-context">
        {projectTitle ? (
          <span>
            Working in <strong>{projectTitle}</strong>
          </span>
        ) : (
          <span>No project open — it can still create one.</span>
        )}
        {provider ? (
          <span className="assistant-model">
            <ModelPicker
              providerId={provider.id}
              baseUrl={provider.baseUrl}
              value={model}
              onChange={setModel}
              listModels={window.inkcrafter.settings.listModels}
            />
          </span>
        ) : (
          <span className="codex-error">No AI provider configured. Add one in Settings.</span>
        )}

        {/* What the dialog's header used to hold. There is no header now, and
            the conversation is the only thing here worth acting on. */}
        {assistant.messages.length > 0 && (
          <Button variant="link" onClick={assistant.clear} disabled={assistant.busy}>
            <Icon name="rotate-ccw" size={13} />
            new conversation
          </Button>
        )}
      </div>

      <div className="assistant-transcript" ref={transcriptRef}>
        {assistant.messages.length === 0 && (
          <EmptyState
            className="assistant-empty"
            body="It can read and write files in your workspace — projects, plans, ink and codex entries. It cannot reach anything outside it."
            action={
              <ul className="assistant-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <Button onClick={() => void submit(suggestion)} disabled={!ready}>
                      {suggestion}
                    </Button>
                  </li>
                ))}
              </ul>
            }
          />
        )}

        {assistant.messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}

        {assistant.busy && (
          <div className="assistant-working">
            <p>
              Working — round {assistant.progress.at(-1)?.round ?? 1} of {MAX_TOOL_ROUNDS}. Large
              jobs can take a few minutes.
            </p>
            {assistant.progress.length > 0 && (
              <ul className="assistant-tools">
                {assistant.progress
                  .filter((update) => update.call !== null)
                  .map((update, index) => (
                    <li key={index} className={update.call!.ok ? '' : 'is-failed'}>
                      <Icon
                        name={update.call!.ok ? 'check' : 'circle-alert'}
                        size={11}
                        style={{
                          color: update.call!.ok ? 'var(--state-ok)' : 'var(--state-error)'
                        }}
                      />
                      <span className="assistant-tool-name">{update.call!.summary}</span>
                    </li>
                  ))}
              </ul>
            )}

            {/* Whatever the tool that is running now last said. One line, and
                only while it is still going — once it finishes, its summary
                joins the list above and this has nothing to add. */}
            {assistant.progress.at(-1)?.note && (
              <p className="assistant-note">
                <Icon name="circle-dashed" size={11} />
                {assistant.progress.at(-1)!.note!.text}
              </p>
            )}
          </div>
        )}

        {assistant.error && <p className="codex-error">{assistant.error}</p>}
      </div>

      <section className="assistant-detected-context" aria-label="Detected context">
        <button
          type="button"
          className="assistant-context-toggle"
          aria-expanded={contextOpen}
          onClick={() => setContextOpen((open) => !open)}
        >
          <Icon name={contextOpen ? 'chevron-down' : 'chevron-right'} size={13} />
          <strong>Context</strong>
          <span>{contextSummary(context, codex.entries.length)}</span>
        </button>
        {contextOpen && (
          <div className="assistant-context-detail">
            <p>{contextLocation(context)}</p>
            {context?.selection && (
              <p>{context.selection.trim().split(/\s+/).length} selected words</p>
            )}
            {codex.entries.length > 0 ? (
              <>
                <p>{codex.entries.length} codex {codex.entries.length === 1 ? 'entry' : 'entries'} sent</p>
                <ChipRow>
                  {codex.entries.map((entry) => (
                    <Chip
                      key={entry.id}
                      variant={codex.detected.has(entry.id) ? 'detected' : 'default'}
                      title={codex.detected.has(entry.id) ? 'Named in the current context' : 'Always sent, or related to something named'}
                    >
                      {entry.name}
                    </Chip>
                  ))}
                </ChipRow>
              </>
            ) : (
              <p className="is-absent">No codex entries recognised</p>
            )}
          </div>
        )}
      </section>

      <form
        className="assistant-input"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(input)
        }}
      >
        <Textarea
          ref={inputRef}
          rows={3}
          value={input}
          placeholder="Ask it to build something…"
          aria-label="Message the assistant"
          disabled={!ready}
          onChange={(event) => setInput(event.target.value)}
          onPointerDown={(event) => {
            // Also repair the handoff on an explicit click. This covers a
            // stale editor focus acquired after the panel mounted.
            if (document.activeElement !== event.currentTarget) {
              const active = document.activeElement
              if (active instanceof HTMLElement) active.blur()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline, since these get long.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit(input)
            }
          }}
        />
        <Button variant="primary" type="submit" disabled={!ready || assistant.busy || input.trim().length === 0}>
          <Icon name="send" size={13} />
          Send
        </Button>
      </form>
    </div>
  )
}

function contextLocation(context: ChatContext | undefined): string {
  if (!context) return 'No view context'
  if (context.view === 'editor') return context.file ? `Ink editor · ${context.file}` : 'Ink editor'
  if (context.view === 'manuscript') return context.section ? `Manuscript · section ${context.section}` : 'Manuscript'
  if (context.view === 'game') return `Game · ${context.catalogue ?? 'catalogues'}`
  return 'Plan'
}

function contextSummary(context: ChatContext | undefined, codexCount: number): string {
  const parts = [contextLocation(context)]
  if (context?.selection) parts.push('selection')
  if (codexCount > 0) parts.push(`${codexCount} codex`)
  return parts.join(' · ')
}

function Bubble({ message }: { message: ChatMessage }): React.JSX.Element {
  return (
    <article className={`assistant-message is-${message.role}`}>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <ul className="assistant-tools">
          {message.toolCalls.map((call) => (
            <ToolLine key={call.id} call={call} />
          ))}
        </ul>
      )}
      <p>{message.content}</p>
    </article>
  )
}

/**
 * One thing the assistant did. Shown always, not on a toggle: a file appearing
 * on disk with no visible cause is what makes a tool like this untrustworthy.
 */
function ToolLine({ call }: { call: ChatToolCall }): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <li className={call.ok ? '' : 'is-failed'}>
      <Icon
        name={call.ok ? 'check' : 'circle-alert'}
        size={11}
        style={{ color: call.ok ? 'var(--state-ok)' : 'var(--state-error)' }}
      />
      <button className="assistant-tool-name" onClick={() => setOpen(!open)} title="Show the arguments">
        {call.summary}
      </button>
      {open && <pre className="assistant-tool-args">{call.argumentsJson}</pre>}
    </li>
  )
}
