/**
 * Asking a model to draft a section of the story.
 *
 * The unit of work is one *section*: the run of prose between two choices. The
 * model writes narrative only — choices, diverts and logic belong to the author
 * and to the rest of the tool, and a model that invents them produces ink that
 * silently reshapes the story's structure.
 */

export const WORD_LIMITS = [200, 400, 600] as const
export type WordLimit = (typeof WORD_LIMITS)[number]

export interface WriteSectionRequest {
  /** Index into `sectionsOf(manuscript)`. */
  sectionIndex: number
  /** What the author wants from this section. */
  instruction: string
  maxWords: WordLimit
  /** Falls back to the active provider from settings. */
  providerId: string
  /** Falls back to the provider's configured model. */
  model: string
}

export interface WriteSectionResult {
  ok: boolean
  /** The drafted prose, as paragraphs separated by blank lines. */
  text: string
  message: string | null
  /** What was sent, so the author can see what the model was told. */
  prompt: string | null
}

/**
 * Asking a model to write *ink*, in the editor.
 *
 * The opposite constraint to `WriteSectionRequest`. There the model writes prose
 * and is forbidden structure, because the author owns the shape of the story.
 * Here structure is the point: choices, diverts, knots. So there is no word
 * limit either — the useful answer might be three lines of choice or a whole
 * knot, and a number in the prompt would only be a number to ignore.
 */
export interface WriteInkRequest {
  /** Project-relative path of the file being written, for the plan lookup. */
  filePath: string
  /** The file as it stands in the editor, unsaved edits included. */
  source: string
  /** What the author wants. */
  instruction: string
  /** The text selected in the editor, when the ask is about a specific part. */
  selection: string
  providerId: string
  model: string
}

export interface WriteInkResult {
  ok: boolean
  /** Ink, ready to be inserted. */
  text: string
  message: string | null
  prompt: string | null
  /** Whether the file with this drafted in compiles, and what went wrong if not. */
  compiles: boolean
  compileError: string | null
}
