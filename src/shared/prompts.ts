/**
 * The instructions the app gives the model, and what the author may change.
 *
 * Every prompt has a default written in the app, and those defaults are worked
 * over carefully — the ink one is checked against the real compiler, the
 * assistant's is checked against the tool list. So this stores an *override*
 * rather than a copy: null means "use whatever the app ships", and a default
 * improved in a later version reaches an author who never touched it.
 *
 * The three are not opened up equally, and the difference is not squeamishness.
 * Prose and ink are single self-contained strings that describe a voice, so
 * replacing one wholesale can only produce writing the author did not want.
 * The assistant's is assembled from the tool routing table, the workspace
 * layout and a worked example of every file format, several of them checked by
 * tests against the code — a prompt missing its tool table still reads fine and
 * quietly cannot call anything. So that one takes an addition instead, which
 * cannot subtract.
 */

export type PromptKind = 'prose' | 'ink' | 'assistant'

export const PROMPT_KINDS: readonly PromptKind[] = ['prose', 'ink', 'assistant']

export interface PromptOverrides {
  /** Replaces the prose drafting prompt. Null uses the app's. */
  prose: string | null
  /** Replaces the ink drafting prompt. Null uses the app's. */
  ink: string | null
  /** Added to the end of the assistant's prompt. Empty adds nothing. */
  assistant: string
}

export function emptyPromptOverrides(): PromptOverrides {
  return { prose: null, ink: null, assistant: '' }
}

/**
 * What the app ships, so the editor can show what is being changed.
 *
 * Fetched on its own rather than carried on `AppSettings`, which is read on
 * every launch and by everything that needs a provider: these are thousands of
 * words that only the settings screen has any use for.
 */
export interface PromptDefaults {
  prose: string
  ink: string
  /** The whole assembled prompt, for reading. Nothing replaces it. */
  assistant: string
}

/** Whether an override is doing anything, so the UI can offer to undo it. */
export function isOverridden(overrides: PromptOverrides, kind: PromptKind): boolean {
  if (kind === 'assistant') return overrides.assistant.trim().length > 0
  return overrides[kind] !== null
}

/**
 * The prompt to send, given what the author has set.
 *
 * One function so that the rule — replace two, append to the third — is stated
 * once rather than at each of the three call sites, where the odd one out would
 * eventually be written as a replacement by someone reading the other two.
 */
export function promptFor(
  kind: PromptKind,
  built: string,
  overrides: PromptOverrides
): string {
  if (kind === 'assistant') {
    const extra = overrides.assistant.trim()
    return extra.length > 0 ? `${built}\n\nFROM THE AUTHOR\n${extra}` : built
  }

  const replacement = overrides[kind]
  return replacement !== null && replacement.trim().length > 0 ? replacement : built
}
