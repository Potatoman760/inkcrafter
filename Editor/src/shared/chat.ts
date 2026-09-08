/**
 * The assistant: a chat that can read and write the workspace.
 *
 * Different in kind from `ai.ts`, which asks a model for prose and pastes the
 * answer somewhere the author chose. Here the model *acts* — it creates
 * projects, seeds ink files, edits a plan — so the transcript has to record what
 * it did, not only what it said. Every tool call and its outcome is part of the
 * conversation and is shown, because a file appearing on disk with no visible
 * cause is the thing that makes a tool like this untrustworthy.
 */

export type ChatRole = 'user' | 'assistant'

export interface ChatToolCall {
  id: string
  name: string
  /** Arguments as the model sent them, for display when they fail to parse. */
  argumentsJson: string
  /** One line describing what happened, e.g. `wrote projects/x/ink/main.ink (412 bytes)`. */
  summary: string
  ok: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  /** Present on an assistant message that used tools before answering. */
  toolCalls?: ChatToolCall[]
  /**
   * Written by the editor, not by the model.
   *
   * It sits in the assistant's column because it is about the turn the author
   * just watched, but it is not something the model said, and it must never be
   * replayed as though it were.
   *
   * The value says why the turn ended early: `rounds` for the loop's own cap,
   * `stopped` for the author pressing Stop. The next turn is told which, because
   * "you ran out of rounds" and "the author stopped you" ask for different
   * things next.
   */
  notice?: 'rounds' | 'stopped'
}

/**
 * What the author is looking at when they ask.
 *
 * The assistant sits in the right-hand dock beside whatever is open, so "add a
 * choice here" and "what does this file do" are the ordinary questions and both
 * are unanswerable without this. Everything is optional: an older client, or a
 * view with nothing open, simply sends less.
 */
export interface ChatContext {
  view: 'editor' | 'manuscript' | 'plan' | 'game'
  /** Project-relative path of the open ink file. */
  file?: string
  /** What is selected in the editor, trimmed to something worth sending. */
  selection?: string
  /** The manuscript section being read. */
  section?: string
  /** Which catalogue the Game view is showing. */
  catalogue?: string
  /** Codex entries selected by the same detector shown beside the input. */
  codexEntryIds?: string[]
  /** Entries named outright, rather than included because they are always sent or related. */
  detectedCodexEntryIds?: string[]
}

/** Longest selection worth quoting. Past this it is a file, and it can read one. */
export const MAX_SELECTION_CHARS = 2000

export interface ChatTurnRequest {
  /** The conversation so far, oldest first, ending with the user's new message. */
  messages: ChatMessage[]
  /** Falls back to the active provider from settings. */
  providerId: string
  /** Falls back to the provider's configured model. */
  model: string
  /** Project the author is looking at, so the assistant can start there. */
  projectPath: string | null
  /** Where in the app they are, so it can answer about what is on screen. */
  context?: ChatContext
}

export interface ChatTurnResult {
  ok: boolean
  /** Messages to append to the transcript — usually one, more if the model was chatty. */
  messages: ChatMessage[]
  message: string | null
  /** True when the loop was stopped by its own cap rather than by the model finishing. */
  truncated: boolean
  /**
   * True when the author pressed Stop.
   *
   * Not a failure, and deliberately separate from `ok`: files written before the
   * stop are on disk and are reported, so the renderer must show the transcript
   * rather than an error.
   */
  stopped: boolean
  /** Workspace-relative paths written this turn, so the UI can refresh what it shows. */
  filesWritten: string[]
}

/** What the renderer is told while a turn is still running. */
export interface ChatProgress {
  round: number
  /** A tool call that has just finished, or null when a round is starting. */
  call: ChatToolCall | null
  /**
   * Said by a tool that has not finished yet. `call` is null when this is set.
   *
   * Only a tool that can run for a minute sends these — drawing a picture is
   * the one that does — and consecutive ones from the same tool replace each
   * other in the transcript rather than piling up.
   */
  note?: { tool: string; text: string }
}

/** How many times the model may call tools and be asked again within one turn. */
export const MAX_TOOL_ROUNDS = 12

/** Total tool calls allowed in one turn, however they are distributed. */
export const MAX_TOOL_CALLS = 60
