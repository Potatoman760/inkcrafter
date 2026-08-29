import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { newId } from '@shared/ids'
import {
  emptyPromptOverrides,
  type PromptKind,
  type PromptOverrides
} from '@shared/prompts'
import {
  DEFAULT_INTERFACE_SCALE,
  DEFAULT_BASE_URL,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  type AppSettings,
  type ConnectionTestResult,
  type ModelListResult,
  type Provider
} from '@shared/settings'
import {
  BINDING_SLOTS,
  COMFY_MAX_TIMEOUT_SECONDS,
  COMFY_MIN_TIMEOUT_SECONDS,
  emptyComfySettings,
  normaliseComfyUrl,
  type BindingOverride,
  WORKFLOW_ROLES,
  type BindingSlot,
  type ComfySettings,
  type NodeField,
  type WorkflowRole
} from '@shared/comfy'

/**
 * Settings live beside Electron's other per-user state, not in the workspace.
 * `data/` is the author's writing — portable, gitignored, copied between
 * machines. A machine-bound encrypted credential would not survive that trip
 * and has no business travelling with a manuscript anyway.
 */
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** The on-disk shape. `apiKey` is a base64 safeStorage blob, never cleartext. */
interface StoredProvider {
  id: string
  label: string
  baseUrl: string
  model: string
  apiKey: string | null
}

interface StoredSettings {
  version: 1
  interfaceScale: number
  providers: StoredProvider[]
  activeProviderId: string | null
  /** Directory used by the most recent native media upload picker. */
  lastUploadDir: string | null
  /**
   * Stored in the clear, deliberately: ComfyUI has no authentication, so there
   * is no credential here to protect. This is an address and a folder path,
   * neither of them secret.
   */
  comfy: ComfySettings
  /** Only what the author changed; the defaults live in the code. */
  prompts: PromptOverrides
  /** RSA private release keys, safeStorage-encrypted and never sent to the renderer. */
  releaseKeys: Record<string, string>
}

const EMPTY: StoredSettings = {
  version: 1,
  interfaceScale: DEFAULT_INTERFACE_SCALE,
  providers: [],
  activeProviderId: null,
  lastUploadDir: null,
  comfy: emptyComfySettings(),
  prompts: emptyPromptOverrides(),
  releaseKeys: {}
}

/**
 * The author's prompt changes, or nothing.
 *
 * An absent or malformed field falls back to the app's own prompts rather than
 * to an empty one, because a prompt is the difference between a model that
 * writes ink and a model that writes an essay about ink.
 */
function asStoredPrompts(value: unknown): PromptOverrides {
  if (typeof value !== 'object' || value === null) return emptyPromptOverrides()
  const record = value as Record<string, unknown>

  const replaced = (key: 'prose' | 'ink'): string | null => {
    const text = record[key]
    return typeof text === 'string' && text.trim().length > 0 ? text : null
  }

  return {
    prose: replaced('prose'),
    ink: replaced('ink'),
    assistant: asString(record['assistant'])
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** A malformed preference must not make the window impossibly small or large. */
function asInterfaceScale(value: unknown): number {
  const scale = typeof value === 'number' && Number.isFinite(value)
    ? value
    : DEFAULT_INTERFACE_SCALE
  return Math.min(Math.max(scale, MIN_INTERFACE_SCALE), MAX_INTERFACE_SCALE)
}

function asStoredProvider(value: unknown): StoredProvider | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const id = asString(record['id'])
  if (id.length === 0) return null

  return {
    id,
    label: asString(record['label'], 'Untitled provider'),
    baseUrl: asString(record['baseUrl'], DEFAULT_BASE_URL),
    model: asString(record['model']),
    apiKey: typeof record['apiKey'] === 'string' ? record['apiKey'] : null
  }
}

function asNodeField(value: unknown): NodeField | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const node = asString(record['node'])
  const field = asString(record['field'])
  return node.length > 0 && field.length > 0 ? { node, field } : null
}

/**
 * One workflow's corrections.
 *
 * A key present with a null value has to survive the round trip: that is how
 * the author says "leave this slot unbound", and dropping it would silently
 * turn the instruction back into "use whatever you detected".
 */
function asBindingOverride(value: unknown): BindingOverride {
  if (typeof value !== 'object' || value === null) return {}
  const record = value as Record<string, unknown>
  const override: BindingOverride = {}

  for (const slot of BINDING_SLOTS) {
    if (!(slot in record)) continue
    override[slot] = record[slot] === null ? null : asNodeField(record[slot])
  }

  return override
}

function asStoredComfy(value: unknown): ComfySettings {
  const empty = emptyComfySettings()
  if (typeof value !== 'object' || value === null) return empty
  const record = value as Record<string, unknown>

  const { url } = normaliseComfyUrl(asString(record['baseUrl']))
  const dir = asString(record['workflowDir'])
  const seconds = typeof record['timeoutSeconds'] === 'number' ? record['timeoutSeconds'] : empty.timeoutSeconds

  const promptPrefixes: Record<string, string> = {}
  const storedPrefixes = record['promptPrefixes']
  if (typeof storedPrefixes === 'object' && storedPrefixes !== null && !Array.isArray(storedPrefixes)) {
    for (const [file, value] of Object.entries(storedPrefixes as Record<string, unknown>)) {
      const text = asString(value)
      if (text.trim().length > 0) promptPrefixes[file] = text
    }
  }

  const overrides: Record<string, BindingOverride> = {}
  const stored = record['overrides']
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [file, one] of Object.entries(stored as Record<string, unknown>)) {
      overrides[file] = asBindingOverride(one)
    }
  }

  const roles: Record<string, WorkflowRole> = {}
  const storedRoles = record['roles']
  if (typeof storedRoles === 'object' && storedRoles !== null && !Array.isArray(storedRoles)) {
    for (const [file, one] of Object.entries(storedRoles as Record<string, unknown>)) {
      if (WORKFLOW_ROLES.includes(one as WorkflowRole)) roles[file] = one as WorkflowRole
    }
  }

  const defaults: Partial<Record<WorkflowRole, string>> = {}
  const storedDefaults = record['defaults']
  if (typeof storedDefaults === 'object' && storedDefaults !== null && !Array.isArray(storedDefaults)) {
    for (const role of WORKFLOW_ROLES) {
      const file = asString((storedDefaults as Record<string, unknown>)[role])
      if (file.length > 0) defaults[role] = file
    }
  }

  return {
    baseUrl: url ?? empty.baseUrl,
    workflowDir: dir.length > 0 ? dir : null,
    timeoutSeconds: Math.min(
      Math.max(Math.round(seconds), COMFY_MIN_TIMEOUT_SECONDS),
      COMFY_MAX_TIMEOUT_SECONDS
    ),
    promptPrefixes,
    overrides,
    defaults,
    roles
  }
}

/**
 * Reads the settings file, tolerating anything. A corrupt or hand-edited config
 * yields defaults rather than an exception — the same principle as the codex
 * markdown parser: configuration must never be able to stop the app starting.
 */
async function read(): Promise<StoredSettings> {
  let raw: string
  try {
    raw = await readFile(settingsPath(), 'utf8')
  } catch {
    return { ...EMPTY }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY }
    const record = parsed as Record<string, unknown>

    const providers = Array.isArray(record['providers'])
      ? record['providers']
          .map(asStoredProvider)
          .filter((provider): provider is StoredProvider => provider !== null)
      : []

    const active = asString(record['activeProviderId'])
    const upload = asString(record['lastUploadDir'])
    const releaseKeys: Record<string, string> = {}
    if (typeof record['releaseKeys'] === 'object' && record['releaseKeys'] !== null) {
      for (const [id, encrypted] of Object.entries(record['releaseKeys'] as Record<string, unknown>)) {
        if (id.length > 0 && typeof encrypted === 'string' && encrypted.length > 0) {
          releaseKeys[id] = encrypted
        }
      }
    }
    return {
      version: 1,
      interfaceScale: asInterfaceScale(record['interfaceScale']),
      providers,
      activeProviderId: providers.some((provider) => provider.id === active) ? active : null,
      lastUploadDir: upload.length > 0 ? upload : null,
      comfy: asStoredComfy(record['comfy']),
      prompts: asStoredPrompts(record['prompts']),
      releaseKeys
    }
  } catch {
    return { ...EMPTY }
  }
}

async function write(settings: StoredSettings): Promise<void> {
  await writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

/** Strips the stored key, leaving only whether one exists. */
function toProvider(stored: StoredProvider): Provider {
  return {
    id: stored.id,
    label: stored.label,
    baseUrl: stored.baseUrl,
    model: stored.model,
    hasKey: stored.apiKey !== null && stored.apiKey.length > 0
  }
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Saves a whole-window scale, clamped to the range the settings UI offers. */
export async function setInterfaceScale(scale: number): Promise<AppSettings> {
  const stored = await read()
  await write({ ...stored, interfaceScale: asInterfaceScale(scale) })
  return loadSettings()
}

/** The folder a native media upload picker should open in. Main-process only. */
export async function lastUploadDir(): Promise<string | null> {
  return (await read()).lastUploadDir
}

/** Remembers a successful upload without exposing machine paths to the renderer. */
export async function setLastUploadDir(dir: string): Promise<void> {
  if (dir.trim().length === 0) return
  const stored = await read()
  await write({ ...stored, lastUploadDir: dir })
}

/**
 * Changes one prompt, or puts it back.
 *
 * Null clears the override, which is what "reset to default" is: nothing is
 * copied back into the file, so the app's own prompt — including a better one
 * in a later version — takes over again. A replacement that says nothing is
 * treated the same way, because selecting everything and deleting it is how an
 * author asks for the default back without noticing there is a button.
 */
export async function setPrompt(kind: PromptKind, text: string | null): Promise<AppSettings> {
  const stored = await read()
  const value = text ?? ''

  const prompts: PromptOverrides =
    kind === 'assistant'
      ? { ...stored.prompts, assistant: value }
      : { ...stored.prompts, [kind]: value.trim().length > 0 ? value : null }

  await write({ ...stored, prompts })
  return loadSettings()
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await read()
  return {
    interfaceScale: stored.interfaceScale,
    providers: stored.providers.map(toProvider),
    activeProviderId: stored.activeProviderId,
    // Carried across whole: unlike a provider there is nothing in it to strip.
    comfy: stored.comfy,
    prompts: stored.prompts,
    encryptionAvailable: encryptionAvailable()
  }
}

/** The ComfyUI address, tidied. A bad one is refused rather than stored. */
export async function setComfyBaseUrl(raw: string): Promise<AppSettings> {
  const { url } = normaliseComfyUrl(raw)
  if (url === null) return loadSettings()

  const stored = await read()
  await write({ ...stored, comfy: { ...stored.comfy, baseUrl: url } })
  return loadSettings()
}

export async function setComfyWorkflowDir(dir: string | null): Promise<AppSettings> {
  const stored = await read()
  const next = dir && dir.trim().length > 0 ? dir : null
  await write({ ...stored, comfy: { ...stored.comfy, workflowDir: next } })
  return loadSettings()
}

export async function setComfyTimeout(seconds: number): Promise<AppSettings> {
  const stored = await read()
  const clamped = Math.min(
    Math.max(Math.round(Number.isFinite(seconds) ? seconds : stored.comfy.timeoutSeconds), COMFY_MIN_TIMEOUT_SECONDS),
    COMFY_MAX_TIMEOUT_SECONDS
  )

  await write({ ...stored, comfy: { ...stored.comfy, timeoutSeconds: clamped } })
  return loadSettings()
}

/** Text placed before the positive prompt for one workflow, or null to clear it. */
export async function setComfyPromptPrefix(
  workflow: string,
  prefix: string | null
): Promise<AppSettings> {
  const stored = await read()
  const promptPrefixes = { ...stored.comfy.promptPrefixes }
  const text = prefix ?? ''

  if (workflow.trim().length === 0) return loadSettings()
  if (text.trim().length > 0) promptPrefixes[workflow] = text
  else delete promptPrefixes[workflow]

  await write({ ...stored, comfy: { ...stored.comfy, promptPrefixes } })
  return loadSettings()
}

/**
 * Repoints one slot of one workflow.
 *
 * `null` is a real value here and means "leave this alone", which is not the
 * same as having no opinion — that is `clearComfyBinding`, which removes the
 * key so detection takes over again.
 */
export async function setComfyBinding(
  workflow: string,
  slot: BindingSlot,
  at: NodeField | null
): Promise<AppSettings> {
  if (!BINDING_SLOTS.includes(slot)) return loadSettings()

  const stored = await read()
  const override = { ...(stored.comfy.overrides[workflow] ?? {}), [slot]: at }

  await write({
    ...stored,
    comfy: { ...stored.comfy, overrides: { ...stored.comfy.overrides, [workflow]: override } }
  })
  return loadSettings()
}

/**
 * Which workflow a role reaches for when the assistant names none.
 *
 * Null forgets the choice, which is not the same as having none — forgetting
 * puts it back to "the first of that kind", and that is what the author gets
 * before they have ever chosen.
 */
export async function setComfyDefault(role: WorkflowRole, workflow: string | null): Promise<AppSettings> {
  if (!WORKFLOW_ROLES.includes(role)) return loadSettings()

  const stored = await read()
  const defaults = { ...stored.comfy.defaults }
  if (workflow) defaults[role] = workflow
  else delete defaults[role]

  await write({ ...stored, comfy: { ...stored.comfy, defaults } })
  return loadSettings()
}

/** What a workflow is for. Null hands it back to whatever reading it suggests. */
export async function setComfyRole(workflow: string, role: WorkflowRole | null): Promise<AppSettings> {
  if (role !== null && !WORKFLOW_ROLES.includes(role)) return loadSettings()

  const stored = await read()
  const roles = { ...stored.comfy.roles }
  if (role) roles[workflow] = role
  else delete roles[workflow]

  await write({ ...stored, comfy: { ...stored.comfy, roles } })
  return loadSettings()
}

export async function clearComfyBinding(workflow: string, slot: BindingSlot): Promise<AppSettings> {
  const stored = await read()
  const override = { ...(stored.comfy.overrides[workflow] ?? {}) }
  delete override[slot]

  const overrides = { ...stored.comfy.overrides }
  // A workflow with nothing left to say about it should stop being listed as
  // edited, so the badge in the tab means what it says.
  if (Object.keys(override).length === 0) delete overrides[workflow]
  else overrides[workflow] = override

  await write({ ...stored, comfy: { ...stored.comfy, overrides } })
  return loadSettings()
}

/**
 * Saves everything about the providers except their keys, which travel by a
 * separate path so the renderer never has to hold one to save an edit.
 */
export async function saveProviders(
  providers: Provider[],
  activeProviderId: string | null
): Promise<AppSettings> {
  const stored = await read()
  const keys = new Map(stored.providers.map((provider) => [provider.id, provider.apiKey]))

  await write({
    ...stored,
    version: 1,
    providers: providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKey: keys.get(provider.id) ?? null
    })),
    activeProviderId: providers.some((provider) => provider.id === activeProviderId)
      ? activeProviderId
      : null
  })

  return loadSettings()
}

export async function createProvider(label: string): Promise<AppSettings> {
  const stored = await read()
  const provider: StoredProvider = {
    id: newId('prv'),
    label: label.trim() || 'New provider',
    baseUrl: DEFAULT_BASE_URL,
    model: '',
    apiKey: null
  }

  await write({
    ...stored,
    version: 1,
    providers: [...stored.providers, provider],
    // The first provider added becomes the active one; there is nothing to choose between.
    activeProviderId: stored.activeProviderId ?? provider.id
  })

  return loadSettings()
}

/**
 * Write-only. Passing null clears the key.
 *
 * Refuses rather than falling back to cleartext when the OS keystore is
 * unavailable: a silent downgrade would leave a credential on disk that the
 * author believes is encrypted, which is worse than not storing it at all.
 */
export async function setApiKey(providerId: string, key: string | null): Promise<AppSettings> {
  const stored = await read()
  const provider = stored.providers.find((candidate) => candidate.id === providerId)
  if (!provider) throw new Error(`No provider with id ${providerId}`)

  if (key === null || key.length === 0) {
    provider.apiKey = null
  } else {
    if (!encryptionAvailable()) {
      throw new Error(
        'The OS keystore is unavailable, so the key cannot be stored securely. Nothing was written.'
      )
    }
    provider.apiKey = safeStorage.encryptString(key).toString('base64')
  }

  await write(stored)
  return loadSettings()
}

export async function deleteProvider(providerId: string): Promise<AppSettings> {
  const stored = await read()
  const providers = stored.providers.filter((provider) => provider.id !== providerId)

  await write({
    ...stored,
    version: 1,
    providers,
    activeProviderId:
      stored.activeProviderId === providerId
        ? (providers[0]?.id ?? null)
        : stored.activeProviderId
  })

  return loadSettings()
}

/** A provider's stored configuration, minus its key. Main-process helper. */
export async function providerById(providerId: string): Promise<Provider | null> {
  const stored = await read()
  const provider = stored.providers.find((candidate) => candidate.id === providerId)
  return provider ? toProvider(provider) : null
}

/** Decrypts a provider's key. Main-process only — the result must not cross IPC. */
export async function apiKeyFor(providerId: string): Promise<string | null> {
  const stored = await read()
  const provider = stored.providers.find((candidate) => candidate.id === providerId)
  if (!provider?.apiKey) return null

  try {
    return safeStorage.decryptString(Buffer.from(provider.apiKey, 'base64'))
  } catch {
    // Written by a different machine or user account, so undecryptable here.
    return null
  }
}

/** Stores a player release private key with the same no-cleartext rule as API keys. */
export async function storeReleasePrivateKey(keyId: string, privateKey: string): Promise<void> {
  if (!encryptionAvailable()) {
    throw new Error(
      'The OS keystore is unavailable, so the release key cannot be stored securely. Nothing was written.'
    )
  }
  const stored = await read()
  await write({
    ...stored,
    releaseKeys: {
      ...stored.releaseKeys,
      [keyId]: safeStorage.encryptString(privateKey).toString('base64')
    }
  })
}

/** Main-process only. A release key is never exposed through IPC to the renderer. */
export async function releasePrivateKeyFor(keyId: string): Promise<string | null> {
  const encrypted = (await read()).releaseKeys[keyId]
  if (!encrypted) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

/** Trailing slashes only; the version path is the author's to get right. */
function normaliseBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * Lists a provider's models — the one endpoint every OpenAI-compatible API
 * agrees on, and so also the cheapest way to tell whether a provider answers at
 * all. Connection testing is this call with the models thrown away.
 */
export async function listModels(providerId: string): Promise<ModelListResult> {
  const stored = await read()
  const provider = stored.providers.find((candidate) => candidate.id === providerId)
  if (!provider) return { ok: false, status: null, message: 'No such provider.', models: [] }

  const baseUrl = normaliseBaseUrl(provider.baseUrl)
  if (baseUrl.length === 0) {
    return { ok: false, status: null, message: 'No base URL set.', models: [] }
  }

  const key = await apiKeyFor(providerId)
  const headers: Record<string, string> = { Accept: 'application/json' }
  // Local runtimes such as Ollama accept requests with no key at all.
  if (key) headers['Authorization'] = `Bearer ${key}`

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15_000)
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200).trim()
      return {
        ok: false,
        status: response.status,
        message: detail.length > 0 ? detail : response.statusText,
        models: []
      }
    }

    const body: unknown = await response.json()
    const data = (body as { data?: unknown })?.data

    // The documented shape is `{ data: [{ id }] }`, but some servers return a
    // bare array, and some list entries without an id. Take what is usable.
    const entries: unknown[] = Array.isArray(data) ? data : Array.isArray(body) ? body : []
    const models = entries
      .map((entry) =>
        typeof entry === 'string' ? entry : ((entry as { id?: unknown })?.id ?? null)
      )
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .sort((a, b) => a.localeCompare(b))

    return {
      ok: true,
      status: response.status,
      message: `Connected. ${models.length} model${models.length === 1 ? '' : 's'} available.`,
      models
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: null, message, models: [] }
  }
}

export async function testProvider(providerId: string): Promise<ConnectionTestResult> {
  const { ok, status, message, models } = await listModels(providerId)
  return { ok, status, message, modelCount: ok ? models.length : null }
}
