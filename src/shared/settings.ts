/**
 * Application settings, as distinct from project settings.
 *
 * These are machine configuration — where the app talks to, with which
 * credential — and live beside the app's other per-user state rather than in
 * the workspace. The workspace holds the author's writing: portable, backed up,
 * and shared. A machine-bound encrypted credential belongs in neither.
 */

import type { ComfySettings } from './comfy'
import type { PromptOverrides } from './prompts'

/** Whole-window scale. Kept bounded so the editor always remains usable. */
export const DEFAULT_INTERFACE_SCALE = 1
export const MIN_INTERFACE_SCALE = 0.8
export const MAX_INTERFACE_SCALE = 1.5

/**
 * Actions the native menu can ask the renderer to perform.
 *
 * A list rather than a bare union so the menu's own tests can check that every
 * one is still reachable — rearranging menus is exactly the change that loses
 * an item without anything failing.
 */
export const MENU_ACTIONS = [
  'file:newProject',
  'file:openProject',
  'file:newFile',
  'file:save',
  'file:closeProject',
  'project:settings',
  'project:libraries',
  'project:stats',
  'project:media',
  'project:cast',
  'project:map',
  'project:export',
  'settings:open',
  'assistant:open',
  'view:editor',
  'view:manuscript',
  'view:outline',
  'view:commands',
  'player:preview'
] as const

export type MenuAction = (typeof MENU_ACTIONS)[number]

/**
 * A provider as the renderer sees it.
 *
 * There is deliberately no `apiKey`. Keys are written by a separate, write-only
 * call and never read back out of the main process, so the sandboxed renderer
 * cannot leak one even if something rendered inside it tried to.
 */
export interface Provider {
  /** `prv_…`. */
  id: string
  label: string
  /**
   * Root of an OpenAI-compatible API, including the version path:
   * `https://api.openai.com/v1`, `http://localhost:11434/v1`.
   */
  baseUrl: string
  model: string
  /** Whether a key is stored. Never the key itself. */
  hasKey: boolean
}

export interface AppSettings {
  /** Persistent whole-window zoom factor; 1 is 100%. */
  interfaceScale: number
  providers: Provider[]
  /** Id of the provider requests will use, or null when none is chosen. */
  activeProviderId: string | null
  /**
   * A checkout of InkCrafter Player to preview into, or null.
   *
   * A path rather than a credential, so it is stored in the clear beside the
   * rest — it is machine configuration in the same way the base URL is.
   */
  playerDir: string | null
  /**
   * The author's local ComfyUI, and what their workflows bind to.
   *
   * Whole rather than stripped, because unlike a provider there is nothing in
   * it to hide — ComfyUI has no authentication, so no key is ever involved.
   */
  comfy: ComfySettings
  /**
   * What the author has changed about the instructions given to the model.
   *
   * Overrides rather than copies: null means the app's own, so a prompt
   * improved in a later version reaches everybody who never touched it.
   */
  prompts: PromptOverrides
  /**
   * False when the OS keystore is unavailable, in which case keys are refused
   * rather than written in cleartext. Surfaced so the UI can explain itself.
   */
  encryptionAvailable: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  /** HTTP status, or null when the request never got that far. */
  status: number | null
  message: string
  /** Models the endpoint reported, when it answered with a list. */
  modelCount: number | null
}

export interface ModelListResult {
  ok: boolean
  status: number | null
  message: string
  /** Model ids, sorted. Aggregators routinely return several hundred. */
  models: string[]
}

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
