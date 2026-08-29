import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  ConnectionTestResult,
  ModelListResult,
  Provider
} from '@shared/settings'
import {
  emptyComfySettings,
  type BindingSlot,
  type NodeField,
  type WorkflowRole
} from '@shared/comfy'
import { emptyPromptOverrides, type PromptKind } from '@shared/prompts'

const SAVE_DEBOUNCE_MS = 500

const EMPTY: AppSettings = {
  interfaceScale: 1,
  providers: [],
  activeProviderId: null,
  comfy: emptyComfySettings(),
  prompts: emptyPromptOverrides(),
  encryptionAvailable: true
}

export interface Settings {
  settings: AppSettings
  loading: boolean
  error: string | null
  /** Changes the whole interface size immediately and persists it. */
  setInterfaceScale(scale: number): Promise<void>
  /** Edits land immediately and are written on a debounce, as elsewhere in the app. */
  updateProvider(provider: Provider): void
  setActive(providerId: string): void
  addProvider(label: string): Promise<Provider | null>
  deleteProvider(providerId: string): Promise<void>
  /** Write-only; the key is handed to main and never comes back. */
  setApiKey(providerId: string, key: string | null): Promise<void>
  testProvider(providerId: string): Promise<ConnectionTestResult>
  listModels(providerId: string): Promise<ModelListResult>
  /** Points the app at a player checkout, or clears it with null. */
  /** Where ComfyUI answers. A malformed address is refused by main. */
  setComfyBaseUrl(url: string): Promise<void>
  setComfyWorkflowDir(dir: string | null): Promise<void>
  setComfyTimeout(seconds: number): Promise<void>
  /** Text prepended to one workflow's positive prompt. Null clears it. */
  setComfyPromptPrefix(workflow: string, prefix: string | null): Promise<void>
  /** Repoints one slot of one workflow. Null leaves the slot unbound. */
  setComfyBinding(workflow: string, slot: BindingSlot, at: NodeField | null): Promise<void>
  /** Forgets a correction, so detection takes the slot back. */
  clearComfyBinding(workflow: string, slot: BindingSlot): Promise<void>
  /**
   * Changes one prompt, or puts it back with null.
   *
   * Null is "reset to default" and clears the override rather than copying the
   * app's text in, so a prompt improved in a later version reaches an author
   * who had reset theirs.
   */
  setPrompt(kind: PromptKind, text: string | null): Promise<void>
  /** Which workflow a role uses when none is named. Null forgets the choice. */
  setComfyDefault(role: WorkflowRole, workflow: string | null): Promise<void>
  /** What a workflow is for. Null hands it back to what was detected. */
  setComfyRole(workflow: string, role: WorkflowRole | null): Promise<void>
}

export function useSettings(enabled: boolean): Settings {
  const [settings, setSettings] = useState<AppSettings>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = useRef<AppSettings | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    setLoading(true)
    window.inkcrafter.settings
      .load()
      .then((loaded) => {
        if (!cancelled) {
          // Main and preload restart separately from a renderer hot reload.
          // During that overlap an older process can return the Comfy shape
          // from before a newly added field existed. Hydrate it at the bridge
          // so opening a settings tab never turns a missing optional map into
          // a whole-window render failure.
          setSettings({
            ...loaded,
            interfaceScale: loaded.interfaceScale ?? 1,
            comfy: {
              ...emptyComfySettings(),
              ...loaded.comfy,
              promptPrefixes: loaded.comfy?.promptPrefixes ?? {}
            }
          })
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  const flush = useCallback(async () => {
    const queued = pending.current
    pending.current = null
    if (!queued) return

    try {
      setSettings(
        await window.inkcrafter.settings.saveProviders(queued.providers, queued.activeProviderId)
      )
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  // Closing the dialog must not discard the last few keystrokes.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      void flush()
    },
    [flush]
  )

  const queue = useCallback(
    (next: AppSettings) => {
      setSettings(next)
      pending.current = next
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  const updateProvider = useCallback(
    (provider: Provider) => {
      queue({
        ...settings,
        providers: settings.providers.map((candidate) =>
          candidate.id === provider.id ? provider : candidate
        )
      })
    },
    [queue, settings]
  )

  const setActive = useCallback(
    (providerId: string) => queue({ ...settings, activeProviderId: providerId }),
    [queue, settings]
  )

  const addProvider = useCallback(async (label: string): Promise<Provider | null> => {
    try {
      const next = await window.inkcrafter.settings.createProvider(label)
      setSettings(next)
      setError(null)
      return next.providers[next.providers.length - 1] ?? null
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return null
    }
  }, [])

  const deleteProvider = useCallback(async (providerId: string) => {
    try {
      setSettings(await window.inkcrafter.settings.deleteProvider(providerId))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const setApiKey = useCallback(
    async (providerId: string, key: string | null) => {
      // Any queued provider edit must land first, or saveProviders would run
      // after this and rewrite the file from state that predates the key.
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()

      try {
        setSettings(await window.inkcrafter.settings.setApiKey(providerId, key))
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [flush]
  )

  const testProvider = useCallback(
    async (providerId: string): Promise<ConnectionTestResult> => {
      // Test what is on disk, not what is on screen.
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()
      return window.inkcrafter.settings.testProvider(providerId)
    },
    [flush]
  )

  const listModels = useCallback(
    async (providerId: string): Promise<ModelListResult> => {
      // Main reads the base URL from disk, so a just-typed one has to land first.
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()
      return window.inkcrafter.settings.listModels(providerId)
    },
    [flush]
  )

  /**
   * Every ComfyUI setting takes the immediate round trip rather than the
   * providers' debounce: each one is a discrete act — choosing a folder,
   * repointing a binding — and main answers with the whole settings object, so
   * what comes back is the truth rather than an optimistic guess at it.
   */
  const viaMain = useCallback(async (change: Promise<AppSettings>): Promise<void> => {
    try {
      setSettings(await change)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const setInterfaceScale = useCallback(
    (scale: number) => viaMain(window.inkcrafter.settings.setInterfaceScale(scale)),
    [viaMain]
  )

  const setComfyBaseUrl = useCallback(
    (url: string) => viaMain(window.inkcrafter.settings.setComfyBaseUrl(url)),
    [viaMain]
  )

  const setComfyWorkflowDir = useCallback(
    (dir: string | null) => viaMain(window.inkcrafter.settings.setComfyWorkflowDir(dir)),
    [viaMain]
  )

  const setComfyTimeout = useCallback(
    (seconds: number) => viaMain(window.inkcrafter.settings.setComfyTimeout(seconds)),
    [viaMain]
  )

  const setComfyPromptPrefix = useCallback(
    (workflow: string, prefix: string | null) =>
      viaMain(window.inkcrafter.settings.setComfyPromptPrefix(workflow, prefix)),
    [viaMain]
  )

  const setComfyBinding = useCallback(
    (workflow: string, slot: BindingSlot, at: NodeField | null) =>
      viaMain(window.inkcrafter.settings.setComfyBinding(workflow, slot, at)),
    [viaMain]
  )

  const clearComfyBinding = useCallback(
    (workflow: string, slot: BindingSlot) =>
      viaMain(window.inkcrafter.settings.clearComfyBinding(workflow, slot)),
    [viaMain]
  )

  const setComfyDefault = useCallback(
    (role: WorkflowRole, workflow: string | null) =>
      viaMain(window.inkcrafter.settings.setComfyDefault(role, workflow)),
    [viaMain]
  )

  const setComfyRole = useCallback(
    (workflow: string, role: WorkflowRole | null) =>
      viaMain(window.inkcrafter.settings.setComfyRole(workflow, role)),
    [viaMain]
  )

  const setPrompt = useCallback(
    (kind: PromptKind, text: string | null) =>
      viaMain(window.inkcrafter.settings.setPrompt(kind, text)),
    [viaMain]
  )

  return {
    settings,
    loading,
    error,
    setInterfaceScale,
    updateProvider,
    setActive,
    addProvider,
    deleteProvider,
    setApiKey,
    testProvider,
    listModels,
    setComfyBaseUrl,
    setComfyWorkflowDir,
    setComfyTimeout,
    setComfyPromptPrefix,
    setComfyBinding,
    clearComfyBinding,
    setComfyDefault,
    setComfyRole,
    setPrompt
  }
}
