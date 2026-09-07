import { vi } from 'vitest'
import { emptyMap } from '@shared/bundle/mapDoc'
import type {
  JunctionNode,
  Manuscript,
  ManuscriptNode,
  ProseNode
} from '@shared/manuscript'
import { EDITABLE, emptyManuscript } from '@shared/manuscript'
import type { AppSettings, Provider } from '@shared/settings'
import { emptyComfySettings } from '@shared/comfy'
import { emptyPromptOverrides } from '@shared/prompts'
import { emptyMedia } from '@shared/mediaDoc'
import { emptyGallery } from '@shared/bundle/galleryDoc'
import { emptyAchievements } from '@shared/bundle/achievementDoc'
import { emptyMinigames } from '@shared/bundle/minigameDoc'
import { emptyStats } from '@shared/statsDoc'
import type { InkCrafterApi } from '@shared/types'
import type { DesktopExportOptions } from '@shared/desktop'
import { PACKAGE_FORMAT } from '@shared/projectPackage'

/**
 * Fixtures and a stub for `window.inkcrafter`.
 *
 * Renderer components talk to the main process for everything, so a test that
 * renders one has to stand in for that side. The stub is deliberately shallow:
 * these tests are about what the component does with what it gets back, and the
 * main process has its own coverage.
 */

let idCounter = 0
const nextId = (): string => `n${idCounter++}`

export function prose(text: string, overrides: Partial<ProseNode> = {}): ProseNode {
  return {
    kind: 'prose',
    id: nextId(),
    text,
    tags: [],
    knot: 'somewhere',
    source: { file: 'ink/main.ink', line: 1 },
    edit: EDITABLE,
    ...overrides
  }
}

export function junction(
  texts: string[],
  chosenIndex: number | null = null,
  overrides: Partial<JunctionNode> = {}
): JunctionNode {
  return {
    kind: 'junction',
    id: nextId(),
    choices: texts.map((text, index) => ({
      index,
      text,
      tags: [],
      source: { file: 'ink/main.ink', line: 10 + index },
      edit: EDITABLE
    })),
    chosenIndex,
    source: { file: 'ink/main.ink', line: 10 },
    ...overrides
  }
}

export function manuscript(nodes: ManuscriptNode[] = []): Manuscript {
  return {
    entryPath: '/p/ink/main.ink',
    entryLabel: 'ink/main.ink',
    nodes,
    path: [],
    wordCount: nodes.reduce(
      (total, node) => (node.kind === 'prose' ? total + node.text.split(/\s+/).length : total),
      0
    ),
    complete: false,
    diagnostics: []
  }
}

export function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'prv_0000000000',
    label: 'Test provider',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    hasKey: true,
    ...overrides
  }
}

export function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    interfaceScale: 1,
    providers: [provider()],
    activeProviderId: 'prv_0000000000',
    comfy: emptyComfySettings(),
    prompts: emptyPromptOverrides(),
    encryptionAvailable: true,
    ...overrides
  }
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/** Installs a stub API, merging the given overrides over sane defaults. */
export function installApi(overrides: DeepPartial<InkCrafterApi> = {}): InkCrafterApi {
  const base = {
    compile: vi.fn(),
    readFile: vi.fn(),
    saveFile: vi.fn(),
    projects: {
      list: vi.fn(async () => [])
    },
    project: {
      check: vi.fn(async () => ({ diagnostics: [], problems: [], files: 0 })),
      mediaUsage: vi.fn(async () => ({}))
    },
    libraries: {},
    codex: {},
    manuscript: {
      sectionReplaceable: vi.fn(async () => ({ safe: true, reason: null })),
      setSectionTag: vi.fn(async () => ({ manuscript: emptyManuscript('', ''), error: null })),
      clearSectionTag: vi.fn(async () => ({ manuscript: emptyManuscript('', ''), error: null })),
      compose: vi.fn(),
      open: vi.fn(),
      choose: vi.fn(),
      reread: vi.fn(),
      edit: vi.fn(),
      traceTo: vi.fn(),
      close: vi.fn()
    },
    plan: {
      read: vi.fn(async () => ({ version: 1, notes: '', globals: [], nodes: [] })),
      write: vi.fn(async (_project, plan) => plan),
      createScene: vi.fn()
    },
    media: {
      read: vi.fn(async () => emptyMedia()),
      write: vi.fn(),
      scan: vi.fn(async () => []),
      deleteFile: vi.fn(),
      reveal: vi.fn(),
      importLook: vi.fn(async () => ({
        ok: false,
        cancelled: true,
        file: null,
        moved: [],
        message: ''
      })),
      cutout: vi.fn(async () => ({
        ok: false,
        file: null,
        colour: null,
        cleared: 0,
        feathered: 0,
        enclosed: 0,
        message: ''
      }))
    },
    stats: {
      read: vi.fn(async () => emptyStats()),
      write: vi.fn(async () => ({ written: [] }))
    },
    npcs: {
      read: vi.fn(async () => ({ version: 1 as const, npcs: [] })),
      write: vi.fn(async () => ({ written: [] }))
    },
    map: {
      read: vi.fn(async () => emptyMap()),
      write: vi.fn(),
      destinations: vi.fn(async () => [])
    },
    gallery: {
      read: vi.fn(async () => emptyGallery()),
      write: vi.fn()
    },
    achievements: {
      read: vi.fn(async () => emptyAchievements()),
      write: vi.fn()
    },
    minigames: {
      read: vi.fn(async () => emptyMinigames()),
      write: vi.fn()
    },
    bundle: {
      export: vi.fn(async (_project, outDir: string) => ({
        ok: true,
        outDir,
        manifest: null,
        diagnostics: [],
        warnings: []
      })),
      generateProtection: vi.fn(async () => ({
        mode: 'protected' as const,
        keyId: '0123456789abcdef01234567',
        publicKey: 'public-key'
      })),
      installProtection: vi.fn(async () => ({ ok: true, message: 'Installed.' })),
      exportDesktop: vi.fn(async (_project, outDir: string, options: DesktopExportOptions) => ({
        ok: true,
        outDir,
        builds: options.platforms.map((platform) => ({
          platform,
          outDir: `${outDir}/${platform}`,
          problem: null
        })),
        diagnostics: [],
        warnings: []
      })),
      onDesktopProgress: vi.fn(() => () => {}),
      chooseDir: vi.fn(async () => null),
      reveal: vi.fn()
    },

    packages: {
      choosePath: vi.fn(async () => '/w/packages/the-archive.zip'),
      write: vi.fn(async (_project, libraryIds: string[], file: string) => ({
        ok: true,
        file,
        files: 12 + libraryIds.length,
        bytes: 4096,
        warnings: [],
        problem: null
      })),
      choose: vi.fn(async () => '/w/packages/the-archive.zip'),
      preview: vi.fn(async (file: string) => ({
        ok: true,
        file,
        manifest: {
          format: PACKAGE_FORMAT,
          generatedBy: 'InkCrafter' as const,
          generatedAt: '2026-09-07T09:00:00.000Z',
          project: { id: 'prj_0000000001', title: 'The Lighthouse', folder: 'the-lighthouse' },
          libraries: []
        },
        libraries: [],
        folder: 'the-lighthouse',
        duplicate: false,
        problem: null
      })),
      open: vi.fn(async () => ({
        ok: true,
        projectPath: '/w/projects/the-lighthouse',
        libraries: [],
        warnings: [],
        problem: null
      }))
    },
    ai: {
      writeSection: vi.fn(async () => ({ ok: true, text: 'Drafted.', message: null, prompt: 'p' })),
      chat: vi.fn(async () => ({
        ok: true,
        messages: [{ id: 'a1', role: 'assistant' as const, content: 'Done.' }],
        message: null,
        truncated: false,
        filesWritten: []
      })),
      onChatProgress: vi.fn(() => () => {})
    },
    settings: {
      load: vi.fn(async () => settings()),
      setInterfaceScale: vi.fn(async (scale: number) => settings({ interfaceScale: scale })),
      saveProviders: vi.fn(),
      createProvider: vi.fn(),
      deleteProvider: vi.fn(),
      setApiKey: vi.fn(),
      testProvider: vi.fn(),
      listModels: vi.fn(async () => ({ ok: true, status: 200, message: 'ok', models: [] })),
      setComfyBaseUrl: vi.fn(async () => settings()),
      setComfyWorkflowDir: vi.fn(async () => settings()),
      setComfyTimeout: vi.fn(async () => settings()),
      setComfyPromptPrefix: vi.fn(async () => settings()),
      setComfyBinding: vi.fn(async () => settings()),
      clearComfyBinding: vi.fn(async () => settings()),
      setComfyDefault: vi.fn(async () => settings()),
      setComfyRole: vi.fn(async () => settings()),
      setPrompt: vi.fn(async () => settings()),
      promptDefaults: vi.fn(async () => ({ prose: '', ink: '', assistant: '' }))
    },
    comfy: {
      test: vi.fn(async () => ({ ok: true, status: 200, message: 'ComfyUI answered.', device: null })),
      chooseDir: vi.fn(async () => null),
      workflows: vi.fn(async () => ({ ok: true, dir: null, message: '', workflows: [] }))
    },
    player: {
      choose: vi.fn(async () => null),
      check: vi.fn(async () => ({ ok: false, problem: 'No player folder is set.' })),
      status: vi.fn(async () => ({
        running: false,
        dir: null,
        url: null,
        lines: [],
        exitCode: null
      })),
      preview: vi.fn(async () => ({
        ok: false,
        outDir: null,
        url: null,
        previewId: null,
        problem: 'No player folder is set.'
      })),
      stop: vi.fn(async () => ({
        running: false,
        dir: null,
        url: null,
        lines: [],
        exitCode: null
      })),
      open: vi.fn()
    },
    workspace: { dataDir: vi.fn(), reveal: vi.fn() },
    onMenuAction: vi.fn(() => () => {})
  }

  const merged = {
    ...base,
    ...overrides,
    manuscript: { ...base.manuscript, ...overrides.manuscript },
    plan: { ...base.plan, ...overrides.plan },
    stats: { ...base.stats, ...overrides.stats },
    media: { ...base.media, ...overrides.media },
    npcs: { ...base.npcs, ...overrides.npcs },
    map: { ...base.map, ...overrides.map },
    gallery: { ...base.gallery, ...overrides.gallery },
    achievements: { ...base.achievements, ...overrides.achievements },
    bundle: { ...base.bundle, ...overrides.bundle },
    packages: { ...base.packages, ...overrides.packages },
    ai: { ...base.ai, ...overrides.ai },
    settings: { ...base.settings, ...overrides.settings },
    // Every namespace has to be listed here as well as above: the outer spread
    // replaces a whole namespace, so a test overriding one method of `comfy`
    // would otherwise silently lose the other two.
    comfy: { ...base.comfy, ...overrides.comfy },
    player: { ...base.player, ...overrides.player }
  } as unknown as InkCrafterApi

  ;(window as unknown as { inkcrafter: InkCrafterApi }).inkcrafter = merged
  return merged
}
