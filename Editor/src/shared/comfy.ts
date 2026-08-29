/**
 * The author's own ComfyUI, as the app talks about it.
 *
 * ComfyUI has no "draw me a picture" endpoint. A request is an entire workflow
 * graph, and the app's job is to take one the author exported and put their
 * words in the right place in it — which means knowing *where* in an arbitrary
 * graph the prompt, the size and the seed live.
 *
 * Those places are the bindings below. They are worked out by reading the graph
 * (`main/comfy/graph.ts`) and can be corrected by hand, because a graph with two
 * samplers or three text nodes has no single right answer and the author is the
 * one who knows which they meant.
 *
 * Types only here, plus the one string check. The algorithm stays in main: the
 * renderer is shown the *result* of reading a graph and never reads one itself.
 */

/** A place in a graph the app may write to. */
export const BINDING_SLOTS = [
  'positive',
  'negative',
  'image',
  'width',
  'height',
  'seed',
  'checkpoint',
  'batch',
  'output'
] as const

export type BindingSlot = (typeof BINDING_SLOTS)[number]

/** What each slot is called where the author reads it. */
export const SLOT_LABELS: Record<BindingSlot, string> = {
  positive: 'Prompt',
  negative: 'Negative prompt',
  image: 'Source picture',
  width: 'Width',
  height: 'Height',
  seed: 'Seed',
  checkpoint: 'Checkpoint',
  batch: 'Batch size',
  output: 'Saved image'
}

/**
 * What a workflow is for.
 *
 * A workflow that starts from an empty latent makes a picture out of nothing;
 * one that loads a picture and works from it changes a picture that exists.
 * They answer different requests — "draw me a harbour" against "give me five
 * expressions from this one" — and a workflow of the wrong sort cannot serve
 * the other, so the app has to know which it is holding.
 */
export const WORKFLOW_ROLES = ['creates', 'edits'] as const
export type WorkflowRole = (typeof WORKFLOW_ROLES)[number]

export const ROLE_LABELS: Record<WorkflowRole, string> = {
  creates: 'Creates',
  edits: 'Edits'
}

/**
 * One writable place: a node and one of its inputs.
 *
 * `output` is the odd one out — nothing is written to it, and only `node`
 * matters, because it names whose pictures to collect when the run finishes.
 */
export interface NodeField {
  node: string
  field: string
}

export type WorkflowBindings = Record<BindingSlot, NodeField | null>

/**
 * Hand corrections to what was detected.
 *
 * A key's *presence* means the author repointed that slot; a null *value* means
 * they deliberately unbound it. So the test is `'negative' in override`, never
 * `override.negative !== null` — the two mean different things, and confusing
 * them turns "leave this alone" into "use the detected one".
 */
export type BindingOverride = Partial<Record<BindingSlot, NodeField | null>>

/** One node, flattened for the settings tab's pickers. */
export interface WorkflowNodeSummary {
  id: string
  classType: string
  /** The title the author gave it in ComfyUI, when the export carried one. */
  title: string | null
  /** Input names holding a literal — the only ones anything can be written to. */
  fields: { name: string; value: string | number | boolean }[]
}

export interface WorkflowAnalysis {
  nodes: WorkflowNodeSummary[]
  /** The node the graph is read outwards from, when one was found. */
  sampler: string | null
  /** What reading the graph found, before any correction. */
  detected: WorkflowBindings
  /** What reading the graph suggests this workflow is for. */
  role: WorkflowRole
  /** Why it says so — "LoadImage #12 reaches KSampler #3". */
  roleNote: string
  /**
   * How each one was arrived at, e.g. "followed KSampler #3 positive →
   * CLIPTextEncode #6 text". Shown under the slot, so the author can see that
   * the app read their graph rather than guessed at it.
   */
  notes: Partial<Record<BindingSlot, string>>
  /** Other nodes that would also have served, for the tab to offer. */
  candidates: Partial<Record<BindingSlot, NodeField[]>>
  /** Anything ambiguous or missing, in the author's words. */
  problems: string[]
}

export interface ComfySettings {
  /** Where ComfyUI answers. */
  baseUrl: string
  /** Folder of API-format workflow exports, or null when none is chosen. */
  workflowDir: string | null
  /** How long one generation may take. */
  timeoutSeconds: number
  /**
   * Text inserted before the positive prompt, keyed by workflow file name.
   *
   * Workflow-specific because LoRA triggers and model tokens that help one
   * graph can be meaningless or harmful in another. Missing means unchanged.
   */
  promptPrefixes: Record<string, string>
  /**
   * Hand corrections, keyed by workflow file name including `.json` — the file
   * name is the stable identity, while node ids change on every re-export.
   */
  overrides: Record<string, BindingOverride>
  /**
   * Which workflow to reach for when the assistant does not name one, per role.
   *
   * One of each, because the two roles answer different requests: a single
   * default could serve only one of them, and the other would have to be named
   * every time. Absent means "the first of that kind", which is what happens
   * before the author has said otherwise.
   */
  defaults: Partial<Record<WorkflowRole, string>>
  /**
   * Roles the author set by hand, keyed by file name. A workflow not in here
   * is whatever reading it suggested.
   */
  roles: Record<string, WorkflowRole>
}

export const COMFY_DEFAULT_BASE_URL = 'http://127.0.0.1:8188'

/**
 * Long, because it has to be. An SDXL generation with an upscale pass takes
 * minutes on a card that is doing anything else at the same time, and a default
 * that cuts those off would make the feature look broken on exactly the
 * workflows people care most about.
 */
export const COMFY_DEFAULT_TIMEOUT_SECONDS = 300
export const COMFY_MIN_TIMEOUT_SECONDS = 30
export const COMFY_MAX_TIMEOUT_SECONDS = 1800

export function emptyComfySettings(): ComfySettings {
  return {
    baseUrl: COMFY_DEFAULT_BASE_URL,
    workflowDir: null,
    timeoutSeconds: COMFY_DEFAULT_TIMEOUT_SECONDS,
    promptPrefixes: {},
    overrides: {},
    defaults: {},
    roles: {}
  }
}

/** The positive prompt one workflow receives; the negative prompt is separate. */
export function prependComfyPrompt(prefix: string | undefined, prompt: string): string {
  const written = prefix?.trim() ?? ''
  return written.length > 0 ? `${written}\n${prompt}` : prompt
}

export interface ComfyTestResult {
  ok: boolean
  /** HTTP status, or null when the request never got that far. */
  status: number | null
  message: string
  /**
   * "ComfyUI 0.3.68 · NVIDIA GeForce RTX 4090 · 24.0 GB", when it said.
   *
   * Worth showing: it is the difference between "something answered on that
   * port" and "the machine I meant answered on that port".
   */
  device: string | null
}

/** One workflow file, read and understood as far as it could be. */
export interface WorkflowSummary {
  /** File name including `.json` — the key overrides are stored under. */
  file: string
  /** File name without `.json` — what the assistant calls it. */
  name: string
  /** Null when the file would not parse; `problem` then says why. */
  analysis: WorkflowAnalysis | null
  problem: string | null
  /** Detected, corrected by any override, and validated against the graph. */
  bindings: WorkflowBindings
  override: BindingOverride
  /** What this workflow is for, after any correction. */
  role: WorkflowRole
  /** True when the role was set by hand rather than read from the graph. */
  roleByHand: boolean
  /** True when this is the one used for its role when none is named. */
  isDefault: boolean
}

export interface WorkflowListResult {
  ok: boolean
  dir: string | null
  message: string
  workflows: WorkflowSummary[]
}

/**
 * The address, tidied, or why it is not one.
 *
 * Not a security boundary, and it should not be mistaken for one: the address
 * is the author's own, and the main process can already reach anything they can.
 * What this does is keep `file:` and `javascript:` out of `fetch`, and turn a
 * typo into a sentence instead of an unhandled rejection three calls later.
 */
export function normaliseComfyUrl(raw: string): { url: string | null; problem: string | null } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { url: null, problem: 'No address yet.' }
  }

  // Checked before parsing, because "127.0.0.1:8188" does not throw for the
  // reason you would guess — a scheme cannot start with a digit, so it fails as
  // unparseable rather than as the missing scheme it actually is.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return {
      url: null,
      problem: `Include the http:// — ${COMFY_DEFAULT_BASE_URL}, not ${trimmed}.`
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      url: null,
      problem: `"${trimmed}" is not an address. It should look like ${COMFY_DEFAULT_BASE_URL}.`
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url: null,
      problem: `The app can only call http and https, not ${parsed.protocol.replace(':', '')}. Include the http:// — ${COMFY_DEFAULT_BASE_URL}, not 127.0.0.1:8188.`
    }
  }

  if (parsed.hostname.length === 0) {
    return { url: null, problem: `"${trimmed}" names no host.` }
  }

  // Trailing slashes only. Everything else the author typed is theirs — a
  // reverse proxy may well serve ComfyUI from a sub-path.
  return { url: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ''), problem: null }
}
