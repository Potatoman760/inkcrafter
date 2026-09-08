import { newId } from '@shared/ids'
import {
  MAX_TOOL_CALLS,
  MAX_TOOL_ROUNDS,
  type ChatProgress,
  type ChatMessage,
  type ChatToolCall,
  type ChatTurnRequest,
  type ChatTurnResult
} from '@shared/chat'
import { apiKeyFor, loadSettings, providerById } from '../settings'
import { dataDir } from '../workspace'
import { chatSystemPrompt } from './chatPrompt'
import { readProject } from '../project'
import { listLibraries, loadEntries } from '../codex/library'
import { librariesDir } from '../workspace'
import { renderCodexContext } from './context'
import { ALL_TOOLS } from './tools'
import { runTool, toolSchemas, type ToolContext } from './workspaceTools'

/**
 * The assistant's turn: a tool-calling loop against an OpenAI-compatible API.
 *
 * The loop is the feature. One request cannot create a project — the model has
 * to look, write, look again — so a turn runs until the model answers with prose
 * instead of tool calls, or until it hits a cap. Both caps exist because a model
 * that has lost the thread will otherwise call `list_files` until the tokens run
 * out, and it is the author paying for that.
 *
 * Everything runs here rather than in the renderer, which has `connect-src
 * 'none'`, has never held the API key, and must not be given filesystem access
 * on a remote service's say-so.
 */

interface ApiToolCall {
  id?: unknown
  function?: { name?: unknown; arguments?: unknown }
}

interface ApiMessage {
  role: string
  content?: string | null
  tool_calls?: ApiToolCall[]
  tool_call_id?: string
}

interface ApiChoice {
  message?: { content?: unknown; tool_calls?: unknown }
  finish_reason?: unknown
}

/**
 * How long one request may take.
 *
 * Generous, because a turn that writes six files emits every one of them as
 * tool-call arguments in a single response, and a reasoning model on a busy
 * provider can spend minutes on that. The old three minutes was tuned for a
 * chat reply and cut off real work.
 */
const REQUEST_TIMEOUT_MS = 600_000

/**
 * How much conversation may be carried into a request.
 *
 * Tool results accumulate: every file read stays in the conversation and is
 * *resent on every subsequent round*. Two large reads early in a twelve-round
 * turn means resending them eleven times, which is slow, expensive, and the
 * likeliest way to run into the timeout above.
 */
const MAX_CONVERSATION_CHARS = 120_000

/** Kept whole regardless of budget, so the model can still see what it just did. */
const RECENT_TOOL_RESULTS = 6

function failure(message: string): ChatTurnResult {
  return { ok: false, messages: [], message, truncated: false, stopped: false, filesWritten: [] }
}

/**
 * What a turn returns once the author has pressed Stop.
 *
 * Not a failure. Whatever the turn had already done is on disk, so it is
 * reported exactly as it would be at any other ending, and the notice that
 * closes the transcript is what lets a later "carry on" resume from that work
 * rather than repeat it.
 *
 * A tool already running is not interrupted. The loop stops between calls, so a
 * picture that is halfway drawn finishes and is recorded; killing it would leave
 * a half-written file behind, which is worse than a short wait.
 */
function stoppedTurn(
  produced: ChatMessage[],
  pendingCalls: ChatToolCall[],
  written: string[]
): ChatTurnResult {
  return {
    ok: true,
    messages: [
      ...produced,
      {
        id: newId('prv'),
        role: 'assistant',
        content: 'Stopped. Anything listed above was done, and is on disk.',
        toolCalls: [...pendingCalls],
        notice: 'stopped'
      }
    ],
    message: null,
    truncated: false,
    stopped: true,
    filesWritten: written
  }
}

/**
 * The request's deadline and the author's Stop button, as one signal.
 *
 * Both have to reach the same request. Without the deadline a provider that
 * never answers hangs the turn forever; without the author's signal, Stop
 * cannot cut a request that is already in flight, and waiting out a
 * ten-minute round is the wait that made the button worth having.
 */
const abortAfter = (ms: number, signal: AbortSignal | undefined): AbortSignal =>
  signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms)

/** Our transcript, as the API wants to see it. */
function toApiMessages(system: string, messages: ChatMessage[]): ApiMessage[] {
  return [
    { role: 'system', content: system },
    ...messages.map((message) =>
      message.notice
        ? { role: 'system', content: describeStop(message) }
        : { role: message.role, content: message.content }
    )
  ]
}

/**
 * A stop notice, as the model should see it.
 *
 * The editor wrote it, so sending it back as an assistant turn shows the model
 * an example of itself announcing that it gave up — and the next turn tends to
 * end the same way, in a near-copy of this very sentence, instead of finishing
 * the work. It goes back as a system note instead.
 *
 * The note carries what the stopped turn had already done, because the turn's
 * tool results are not in the new conversation: without this, "continue" reads
 * the same files over again and runs out of rounds in the same place.
 */
function describeStop(message: ChatMessage): string {
  const done = (message.toolCalls ?? []).filter((call) => call.ok).map((call) => `- ${call.summary}`)
  const already =
    done.length > 0
      ? ['It had already done this, and the results are on disk:', ...done].join('\n')
      : 'It had not completed any tool call.'

  // The two reasons ask for different things next. Running out of rounds means
  // carry on unprompted; the author pressing Stop means they wanted it to
  // stop, so the next move is theirs to direct, and picking the work back up
  // uninvited is the one thing the button was pressed to prevent.
  const stopped = message.notice === 'stopped'
  const why = stopped
    ? 'Editor note, not something you said: the author stopped the previous turn part-way, before you had finished.'
    : `Editor note, not something you said: the previous turn was stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls, before you had finished.`
  const next = stopped
    ? 'Answer whatever the author says next. If they ask you to continue, carry on from there rather than repeating the work listed above.'
    : 'Carry on from there. Do not repeat work listed above, and do not tell the author that you stopped — say what you are doing and do it.'

  return [why, already, next].join('\n\n')
}

const sizeOf = (messages: ApiMessage[]): number =>
  messages.reduce((total, message) => total + (message.content?.length ?? 0), 0)

/**
 * Replaces the bodies of older tool results once the conversation gets too big.
 *
 * Only tool results are touched, and only the oldest: the system prompt, what
 * the author said, and the model's own tool calls all have to stay, or the
 * conversation stops making sense. A stub is left in place of the body rather
 * than the message being dropped, because a `tool` message whose `tool_call_id`
 * has vanished is a protocol error at the far end.
 *
 * Mutates in place — the conversation is this function's own working array.
 */
function trimConversation(conversation: ApiMessage[]): void {
  if (sizeOf(conversation) <= MAX_CONVERSATION_CHARS) return

  const results = conversation.filter((message) => message.role === 'tool')
  const trimmable = results.slice(0, Math.max(0, results.length - RECENT_TOOL_RESULTS))

  for (const message of trimmable) {
    if (sizeOf(conversation) <= MAX_CONVERSATION_CHARS) return
    const was = message.content?.length ?? 0
    if (was < 500) continue
    message.content = `[${was} characters of this result dropped to keep the conversation small. Read the file again if you still need it.]`
  }
}

export async function runChatTurn(
  request: ChatTurnRequest,
  onProgress?: (progress: ChatProgress) => void,
  /** Aborted when the author presses Stop. Absent means the turn cannot be stopped. */
  signal?: AbortSignal
): Promise<ChatTurnResult> {
  const settings = await loadSettings()
  const providerId = request.providerId || settings.activeProviderId
  if (!providerId) return failure('No AI provider is configured. Add one in Settings.')

  const provider = await providerById(providerId)
  if (!provider) return failure('That provider no longer exists.')

  const model = request.model || provider.model
  if (!model) return failure('No model is selected for this provider.')

  const key = await apiKeyFor(providerId)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Authorization'] = `Bearer ${key}`
  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '')

  // Resolved once for the turn. The catalogue tools act on the open project,
  // and a path alone is not enough — they need its id, title and libraries.
  const project = request.projectPath ? await readProject(request.projectPath).catch(() => null) : null

  // Resolve the renderer's selection against the libraries on disk. The ids
  // say what the shared detector selected; the renderer never supplies the
  // authoritative entry text that reaches the model.
  let codexBlock = ''
  if (project && request.context?.codexEntryIds?.length) {
    const libraries = await listLibraries(librariesDir())
    const linked = libraries.filter((library) => project.libraries.includes(library.id))
    const all = (await Promise.all(linked.map((library) => loadEntries(library)))).flat()
    const selectedIds = new Set(request.context.codexEntryIds)
    const entries = all.filter((entry) => selectedIds.has(entry.id))
    codexBlock = renderCodexContext({
      entries,
      detected: new Set(request.context.detectedCodexEntryIds ?? [])
    })
  }

  // Which call a note belongs to. Two mutable locals rather than something
  // threaded through the tool, because tools run strictly one at a time and are
  // awaited — there is never a second call in flight to confuse a note with.
  let activeRound = 0
  let activeTool = ''

  const context: ToolContext = {
    root: dataDir(),
    written: [],
    project,
    onProgress: (text) => onProgress?.({ round: activeRound, call: null, note: { tool: activeTool, text } })
  }
  const conversation = toApiMessages(
    chatSystemPrompt(request.projectPath, request.context, settings.prompts.assistant, codexBlock),
    request.messages
  )

  const produced: ChatMessage[] = []
  const pendingCalls: ChatToolCall[] = []
  let toolCallsMade = 0
  let truncated = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) return stoppedTurn(produced, pendingCalls, context.written)

    // Before every request, not just once: the conversation grows by a tool
    // result each round, and it is the resending that costs.
    trimConversation(conversation)
    onProgress?.({ round: round + 1, call: null })

    let body: unknown
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: conversation,
          tools: toolSchemas(ALL_TOOLS),
          tool_choice: 'auto',
          temperature: 0.3
        }),
        signal: abortAfter(REQUEST_TIMEOUT_MS, signal)
      })

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300).trim()
        return {
          ok: false,
          messages: produced,
          message: `${response.status} ${detail || response.statusText}`,
          truncated,
          stopped: false,
          filesWritten: context.written
        }
      }

      body = await response.json()
    } catch (cause) {
      // The deadline carries its own signal, so an abort reaching here is the
      // author's. Check theirs first, or Stop surfaces as a request failure.
      if (signal?.aborted) return stoppedTurn(produced, pendingCalls, context.written)

      return {
        ok: false,
        messages: produced,
        message: describeFailure(cause, round, context.written),
        truncated,
        stopped: false,
        filesWritten: context.written
      }
    }

    const choice = (body as { choices?: ApiChoice[] })?.choices?.[0]
    const content = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : ''
    const calls = Array.isArray(choice?.message?.tool_calls)
      ? (choice.message.tool_calls as ApiToolCall[])
      : []

    // No tools this round: the model is answering, and the turn is over.
    if (calls.length === 0) {
      if (content.length === 0 && produced.length === 0 && pendingCalls.length === 0) {
        return {
          ok: false,
          messages: [],
          message: 'The provider returned no text.',
          truncated,
          stopped: false,
          filesWritten: context.written
        }
      }

      produced.push({
        id: newId('prv'),
        role: 'assistant',
        content: content || 'Done.',
        ...(pendingCalls.length > 0 ? { toolCalls: [...pendingCalls] } : {})
      })

      return {
        ok: true,
        messages: produced,
        message: null,
        truncated,
        stopped: false,
        filesWritten: context.written
      }
    }

    // The assistant's tool-call message has to go back verbatim, or the tool
    // results that follow have nothing to attach to.
    conversation.push({
      role: 'assistant',
      content: content || null,
      tool_calls: calls as ApiToolCall[]
    })

    for (const call of calls) {
      // Between calls, not during one. A round can carry six of them, and
      // finishing the remaining five after Stop is what the button is not for.
      if (signal?.aborted) return stoppedTurn(produced, pendingCalls, context.written)

      const id = typeof call.id === 'string' ? call.id : `call_${toolCallsMade}`
      const name = typeof call.function?.name === 'string' ? call.function.name : ''
      const argumentsJson =
        typeof call.function?.arguments === 'string' ? call.function.arguments : '{}'

      if (toolCallsMade >= MAX_TOOL_CALLS) {
        truncated = true
        conversation.push({
          role: 'tool',
          tool_call_id: id,
          content: `Stopped: this turn has already made ${MAX_TOOL_CALLS} tool calls. Summarise what you have done and finish.`
        })
        continue
      }

      toolCallsMade++
      activeRound = round + 1
      activeTool = name || 'unknown'
      const result = await runTool(name, argumentsJson, context, ALL_TOOLS)

      const record: ChatToolCall = {
        id,
        name: name || 'unknown',
        argumentsJson,
        summary: result.summary,
        ok: result.ok
      }
      pendingCalls.push(record)
      onProgress?.({ round: round + 1, call: record })

      conversation.push({ role: 'tool', tool_call_id: id, content: result.content })
    }
  }

  // Out of rounds with the model still working. Whatever it wrote is on disk and
  // is reported, because silently dropping the record of it would be worse.
  return {
    ok: true,
    messages: [
      ...produced,
      {
        id: newId('prv'),
        role: 'assistant',
        content: `I stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls without finishing. What is above was done; ask me to continue if it looks right.`,
        toolCalls: [...pendingCalls],
        notice: 'rounds'
      }
    ],
    message: null,
    truncated: true,
    stopped: false,
    filesWritten: context.written
  }
}

/**
 * Why the turn stopped, in terms the author can act on.
 *
 * A timeout arrives as "The operation was aborted due to timeout", which says
 * nothing about how long was waited, how far it got, or whether any of the work
 * survived — and files written before it gave up are still on disk.
 */
function describeFailure(cause: unknown, round: number, written: string[]): string {
  const raw = cause instanceof Error ? cause.message : String(cause)
  const timedOut = cause instanceof Error && (cause.name === 'TimeoutError' || /timeout/i.test(raw))

  const done =
    written.length === 0
      ? 'Nothing was written.'
      : `${written.length} file${written.length === 1 ? '' : 's'} had already been written and ${written.length === 1 ? 'is' : 'are'} still there.`

  if (!timedOut) return `${raw} ${done}`

  return (
    `The provider did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 60_000)} minutes ` +
    `(round ${round + 1} of ${MAX_TOOL_ROUNDS}). ${done} ` +
    'Asking for less at a time usually helps — one chapter rather than five.'
  )
}
