import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatContext, ChatMessage, ChatProgress } from '@shared/chat'

export interface AssistantSession {
  messages: ChatMessage[]
  busy: boolean
  /**
   * Stop has been pressed and the turn has not settled yet.
   *
   * Its own flag rather than a derived one, because `busy` stays true through
   * this: a tool already running is allowed to finish, so there is a stretch of
   * seconds where the honest thing to show is neither "working" nor "done".
   */
  stopping: boolean
  /** What the current turn has done so far, oldest first. Cleared when it ends. */
  progress: ChatProgress[]
  error: string | null
  send: (
    text: string,
    options: {
      providerId: string
      model: string
      projectPath: string | null
      /** What the author is looking at, so it can answer about what is on screen. */
      context?: ChatContext
    }
  ) => Promise<string[]>
  /**
   * Asks main to stop the turn in flight. Safe to call when nothing is running.
   *
   * There is nothing to await: the turn ends through `send`, which returns the
   * work it had already done, exactly as it would at any other ending.
   */
  stop: () => void
  clear: () => void
}

let counter = 0
function localId(): string {
  counter += 1
  return `msg_${counter}`
}

/**
 * The assistant's transcript.
 *
 * Held here rather than inside the dialog so that closing the dialog does not
 * throw the conversation away — the assistant is asked to do something, the
 * author goes and looks at the result, and then wants to say "not quite, try
 * the second one again".
 *
 * The user's message is appended before the request goes out, so it appears
 * immediately, and stays if the request then fails.
 */
export function useAssistant(): AssistantSession {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ChatProgress[]>([])
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Subscribed once for the session. A turn runs for minutes and the renderer
  // is otherwise blind until it finishes, which makes slow look like hung.
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(
    () =>
      window.inkcrafter.ai.onChatProgress((update) => {
        if (!busyRef.current) return

        setProgress((current) => {
          // A tool that narrates itself sends a note every step, and a
          // twenty-step generation would otherwise add twenty lines saying
          // nearly the same thing. The newest replaces the one it supersedes.
          const last = current.at(-1)
          const supersedes =
            update.note !== undefined &&
            last?.note !== undefined &&
            last.call === null &&
            last.round === update.round &&
            last.note.tool === update.note.tool

          return supersedes ? [...current.slice(0, -1), update] : [...current, update]
        })
      }),
    []
  )

  const send = useCallback<AssistantSession['send']>(
    async (text, { providerId, model, projectPath, context }) => {
      const trimmed = text.trim()
      if (trimmed.length === 0 || busy) return []

      const asked: ChatMessage = { id: localId(), role: 'user', content: trimmed }
      const conversation = [...messages, asked]

      setMessages(conversation)
      setBusy(true)
      setProgress([])
      setStopping(false)
      setError(null)

      try {
        const result = await window.inkcrafter.ai.chat({
          messages: conversation,
          providerId,
          model,
          projectPath,
          context
        })

        // Whatever the assistant managed before failing is still worth showing:
        // it may already have written files, and hiding that would be a lie.
        if (result.messages.length > 0) {
          setMessages((current) => [...current, ...result.messages])
        }

        if (!result.ok) setError(result.message ?? 'The assistant failed.')
        return result.filesWritten
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return []
      } finally {
        setBusy(false)
        setStopping(false)
        setProgress([])
      }
    },
    [messages, busy]
  )

  const stop = useCallback(() => {
    // Marked here rather than on main's answer, so the button changes the
    // moment it is pressed. A turn stops between tool calls, and a press that
    // looked ignored for ten seconds would just be pressed again.
    setStopping(true)
    void window.inkcrafter.ai.cancelChat()
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, busy, stopping, progress, error, send, stop, clear }
}
