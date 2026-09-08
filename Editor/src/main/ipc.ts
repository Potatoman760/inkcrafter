import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dialog, ipcMain, shell } from 'electron'
import type { CodexEntry } from '@shared/codex'
import type {
  WriteInkRequest,
  WriteInkResult,
  WriteSectionRequest,
  WriteSectionResult
} from '@shared/ai'
import type { ChatTurnRequest, ChatTurnResult } from '@shared/chat'
import type { Manuscript } from '@shared/manuscript'
import type { PlanDocument } from '@shared/planDoc'
import type { MediaDocument } from '@shared/mediaDoc'
import type { TagCommand } from '@shared/bundle/tagSpec'
import type { PromptDefaults, PromptKind } from '@shared/prompts'
import { SYSTEM_PROMPT } from './ai/prompt'
import { INK_SYSTEM_PROMPT } from './ai/inkPrompt'
import { chatSystemPrompt } from './ai/chatPrompt'
import type { NpcDocument } from '@shared/bundle/npcDoc'
import type { MapDocument } from '@shared/bundle/mapDoc'
import type { GalleryDocument } from '@shared/bundle/galleryDoc'
import type { AchievementDocument } from '@shared/bundle/achievementDoc'
import type { MinigameDocument } from '@shared/bundle/minigameDoc'
import type { StatsDocument } from '@shared/statsDoc'
import type { CodexLibrary, Project, ProjectFile } from '@shared/project'
import type {
  AppSettings,
  ConnectionTestResult,
  ModelListResult,
  Provider
} from '@shared/settings'
import type {
  CompileRequest,
  CompileResult,
  CutoutRequest,
  CutoutResult,
  ImportLookRequest,
  ImportLookResult,
  MediaFile,
  NameUse
} from '@shared/types'
import type { BundleExportResult } from '@shared/bundle/result'
import type { DesktopExportOptions, DesktopExportResult } from '@shared/desktop'
import type {
  PackageImportResult,
  PackagePreview,
  PackageResult
} from '@shared/projectPackage'
import type {
  MentionCountRequest,
  MediaUsage,
  ProjectCheck,
  SearchRequest,
  SearchResult
} from '@shared/types'
import {
  createLibrary,
  deleteEntry,
  listLibraries,
  loadEntries,
  moveEntry,
  saveEntry,
  saveLibrary
} from './codex/library'
import { MEDIA_DIR } from '@shared/mediaDoc'
import { safePath } from './fs'
import {
  addFolder,
  copyInkFile,
  deleteInkPath,
  listInkFolders,
  moveInkFile,
  referencesTo
} from './projectFiles'
import type { InkReference } from '@shared/inkRefs'
import type { InkMoveResult } from '@shared/types'
import { compileInk } from './ink/compiler'
import { writeSection } from './ai/generate'
import { runChatTurn } from './ai/chat'
import { writeInk } from './ai/generateInk'
import type { ReplaceCheck } from './manuscript/compose'
import {
  chooseAt,
  clearSectionTag,
  closeManuscript,
  composeIntoSection,
  currentManuscript,
  currentProject,
  editNode,
  openManuscript,
  rereadManuscript,
  sectionReplaceable,
  setSectionTag,
  traceToKnot,
  type ComposeMode,
  type EditOutcome,
  type TraceOutcome
} from './manuscript/session'
import { createPlanScene, readPlan, writePlan } from './plan'
import { deleteMediaFile, readMedia, scanMedia, writeMedia } from './media'
import { readMinigames, writeMinigames } from './minigames'
import { importLook, IMPORTABLE } from './mediaImport'
import { watchProject, writeWatched, type ProjectWatcher } from './watch'
import { chooseUploadFile } from './uploadPicker'
import { cutoutLook } from './mediaCutout'
import { countMentionsAcross } from './mentions'
import { searchInk } from './search'
import { checkProject } from './check'
import { mediaUsage } from './mediaUsage'
import { readGame, writeGame } from './game'
import type { GameDocument } from '@shared/bundle/gameDoc'
import { exportBundle } from './bundle'
import { desktopTools, exportDesktop } from './desktopExport'
import { importPackage, packageFileName, packageProject, previewPackage } from './projectPackage'
import { generateProjectProtection, installProjectProtection } from './releaseProtection'
import {
  checkPlayer,
  openPlayer,
  playerUrl,
  playerDir,
  previewDir,
  startPlayer
} from './player'
import { readNpcs, writeNpcs, type WriteNpcsResult } from './npcs'
import type { KnotSource } from '@shared/inkKnots'
import { listDestinations, readMap, writeMap } from './map'
import { readGallery, writeGallery } from './gallery'
import { readAchievements, writeAchievements } from './achievements'
import { readStats, writeStats, type WriteStatsResult } from './stats'
import { findNameUses } from './statsUses'
import { createProject, listInkFiles, listProjects, saveProject } from './project'
import {
  clearComfyBinding,
  createProvider,
  deleteProvider,
  listModels,
  loadSettings,
  saveProviders,
  setApiKey,
  setComfyBaseUrl,
  setComfyBinding,
  setComfyDefault,
  setComfyPromptPrefix,
  setComfyRole,
  setComfyTimeout,
  setComfyWorkflowDir,
  setInterfaceScale,
  setPrompt,
  testProvider
} from './settings'
import { testComfy } from './comfy/client'
import { listWorkflows } from './comfy/workflows'
import type {
  BindingSlot,
  ComfyTestResult,
  NodeField,
  WorkflowListResult,
  WorkflowRole
} from '@shared/comfy'
import type { PreviewResult } from '@shared/player'
import { stripBom } from './text'
import { dataDir, ensureWorkspace, librariesDir, projectsDir } from './workspace'

async function libraryById(id: string): Promise<CodexLibrary> {
  const library = (await listLibraries(librariesDir())).find((candidate) => candidate.id === id)
  if (!library) throw new Error(`No codex library with id ${id}`)
  return library
}

/** Every entry across the given libraries, flattened. */
async function entriesOfLibraries(libraryIds: string[]): Promise<CodexEntry[]> {
  const libraries = await listLibraries(librariesDir())
  const linked = libraries.filter((library) => libraryIds.includes(library.id))
  const entries = await Promise.all(linked.map((library) => loadEntries(library)))
  return entries.flat().sort((a, b) => a.name.localeCompare(b.name))
}

/** The one project watcher, held here because only main can close it. */
let watching: ProjectWatcher | null = null

/**
 * The assistant turn in flight for each window, so Stop can reach it.
 *
 * Keyed by sender rather than kept as a single controller because two windows
 * have two conversations, and stopping one must not stop the other. The entry
 * exists only while a turn is running, which is also how `ai:cancelChat`
 * answers whether there was anything to stop.
 */
const chatTurns = new Map<number, AbortController>()

export function registerIpcHandlers(): void {
  ipcMain.handle('ink:compile', (_event, request: CompileRequest): CompileResult => compileInk(request))

  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> =>
    stripBom(await readFile(filePath, 'utf8'))
  )

  ipcMain.handle('file:save', async (_event, filePath: string, contents: string): Promise<void> => {
    await writeWatched(filePath, contents)
  })

  /**
   * Watches the open project, or stops when handed null.
   *
   * One at a time, and owned here rather than by the renderer: a watcher is an
   * open handle on the filesystem, and the renderer can be reloaded out from
   * under it. Reported back to whoever asked, which is the window showing that
   * project.
   */
  ipcMain.handle('watch:project', (event, project: Project | null): void => {
    watching?.close()
    watching = null
    if (!project) return

    const sender = event.sender
    watching = watchProject(project, (change) => {
      if (!sender.isDestroyed()) sender.send('watch:changed', change)
    })
  })

  ipcMain.handle('workspace:dataDir', async (): Promise<string> => {
    await ensureWorkspace()
    return dataDir()
  })

  ipcMain.handle('workspace:reveal', async (): Promise<void> => {
    await ensureWorkspace()
    await shell.openPath(dataDir())
  })

  ipcMain.handle('projects:list', async (): Promise<Project[]> => {
    await ensureWorkspace()
    return listProjects(projectsDir())
  })

  ipcMain.handle('projects:create', async (_event, title: string): Promise<Project> => {
    await ensureWorkspace()
    return createProject(projectsDir(), title)
  })

  ipcMain.handle('projects:save', (_event, project: Project): Promise<void> => saveProject(project))

  ipcMain.handle('projects:files', (_event, project: Project): Promise<ProjectFile[]> =>
    listInkFiles(project)
  )

  ipcMain.handle(
    'projects:addFile',
    async (_event, project: Project, path: string): Promise<string> => {
      // The path comes from the renderer, so it is validated against the
      // project directory before anything is written.
      const absolute = safePath(project.path, path, '.ink')
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, '', { encoding: 'utf8', flag: 'wx' })
      return path
    }
  )

  ipcMain.handle('projects:folders', (_event, project: Project): Promise<string[]> =>
    listInkFolders(project)
  )

  ipcMain.handle(
    'projects:addFolder',
    (_event, project: Project, path: string): Promise<string> => addFolder(project, path)
  )

  ipcMain.handle(
    'projects:moveFile',
    (_event, project: Project, from: string, to: string): Promise<InkMoveResult> =>
      moveInkFile(project, from, to)
  )

  ipcMain.handle(
    'projects:copyFile',
    (_event, project: Project, from: string, toFolder: string): Promise<InkMoveResult> =>
      copyInkFile(project, from, toFolder)
  )

  ipcMain.handle(
    'projects:references',
    (_event, project: Project, path: string): Promise<InkReference[]> =>
      referencesTo(project, path)
  )

  ipcMain.handle(
    'projects:deleteFile',
    (_event, project: Project, path: string): Promise<void> => deleteInkPath(project, path)
  )

  ipcMain.handle('projects:reveal', async (_event, project: Project): Promise<void> => {
    await shell.openPath(project.path)
  })

  ipcMain.handle('libraries:list', async (): Promise<CodexLibrary[]> => {
    await ensureWorkspace()
    return listLibraries(librariesDir())
  })

  ipcMain.handle('libraries:create', async (_event, title: string): Promise<CodexLibrary> => {
    await ensureWorkspace()
    return createLibrary(librariesDir(), title)
  })

  ipcMain.handle('libraries:save', (_event, library: CodexLibrary): Promise<void> =>
    saveLibrary(library)
  )

  ipcMain.handle('libraries:reveal', async (_event, id: string): Promise<void> => {
    await shell.openPath((await libraryById(id)).path)
  })

  ipcMain.handle(
    'codex:load',
    (_event, libraryIds: string[]): Promise<CodexEntry[]> => entriesOfLibraries(libraryIds)
  )

  ipcMain.handle(
    'codex:save',
    async (_event, entry: CodexEntry, names: Record<string, string>): Promise<void> =>
      saveEntry(await libraryById(entry.libraryId), entry, names)
  )

  ipcMain.handle('codex:remove', async (_event, entry: CodexEntry): Promise<void> =>
    deleteEntry(await libraryById(entry.libraryId), entry.file)
  )

  ipcMain.handle('codex:move', async (_event, entry: CodexEntry, toFile: string): Promise<void> =>
    moveEntry(await libraryById(entry.libraryId), entry.file, toFile)
  )

  ipcMain.handle(
    'codex:mentionCounts',
    (
      _event,
      project: Project,
      request: MentionCountRequest
    ): Promise<Record<string, number>> => countMentionsAcross(project, request)
  )

  ipcMain.handle(
    'manuscript:open',
    (_event, project: Project, entryPath: string): Promise<Manuscript> =>
      openManuscript(project, entryPath)
  )

  ipcMain.handle(
    'manuscript:choose',
    (_event, nodeId: string, choiceIndex: number): Manuscript => chooseAt(nodeId, choiceIndex)
  )

  ipcMain.handle('manuscript:reread', (): Promise<Manuscript> => rereadManuscript())

  ipcMain.handle(
    'manuscript:edit',
    (_event, nodeId: string, choiceIndex: number | null, text: string): Promise<EditOutcome> =>
      editNode(nodeId, choiceIndex, text)
  )

  ipcMain.handle(
    'manuscript:traceTo',
    (_event, project: Project, entryPath: string, knot: string): Promise<TraceOutcome> =>
      traceToKnot(project, entryPath, knot)
  )

  ipcMain.handle(
    'manuscript:sectionReplaceable',
    (_event, sectionIndex: number): ReplaceCheck => sectionReplaceable(sectionIndex)
  )

  ipcMain.handle(
    'manuscript:setSectionTag',
    (_event, sectionIndex: number, command: TagCommand, replacing?: string) =>
      setSectionTag(sectionIndex, command, replacing)
  )

  ipcMain.handle('manuscript:clearSectionTag', (_event, sectionIndex: number, raw: string) =>
    clearSectionTag(sectionIndex, raw)
  )

  ipcMain.handle(
    'manuscript:compose',
    (_event, sectionIndex: number, mode: ComposeMode, text: string): Promise<EditOutcome> =>
      composeIntoSection(sectionIndex, mode, text)
  )

  ipcMain.handle(
    'ai:writeSection',
    async (_event, request: WriteSectionRequest): Promise<WriteSectionResult> => {
      const manuscript = currentManuscript()
      if (!manuscript) {
        return { ok: false, text: '', message: 'No manuscript is open.', prompt: null }
      }

      // Loaded here rather than passed from the renderer, so the prompt is built
      // from what is on disk rather than from a view that may have drifted.
      const project = currentProject()
      if (!project) return writeSection(manuscript, request)

      const [codex, plan, libraries] = await Promise.all([
        entriesOfLibraries(project.libraries),
        readPlan(project),
        listLibraries(librariesDir())
      ])

      return writeSection(manuscript, request, {
        codex,
        plan: plan.nodes.length > 0 ? plan : null,
        libraryTitles: Object.fromEntries(libraries.map((library) => [library.id, library.title]))
      })
    }
  )

  ipcMain.handle(
    'ai:writeInk',
    async (_event, request: WriteInkRequest, project: Project): Promise<WriteInkResult> => {
      if (!project) return writeInk(request, null)

      // Read here rather than passed from the renderer, so the context is built
      // from what is on disk rather than a view that may have drifted.
      const [codex, plan, libraries] = await Promise.all([
        entriesOfLibraries(project.libraries),
        readPlan(project),
        listLibraries(librariesDir())
      ])

      return writeInk(request, project, {
        codex,
        plan: plan.nodes.length > 0 ? plan : null,
        libraryTitles: Object.fromEntries(libraries.map((library) => [library.id, library.title]))
      })
    }
  )

  ipcMain.handle(
    'ai:chat',
    async (event, request: ChatTurnRequest): Promise<ChatTurnResult> => {
      // A second turn in the same window can only mean the first is stale, so it
      // is stopped rather than left running alongside: it holds the same
      // workspace and would write into whatever the new one is doing.
      chatTurns.get(event.sender.id)?.abort()

      const turn = new AbortController()
      chatTurns.set(event.sender.id, turn)
      try {
        // A turn can run for minutes; without the progress callback the renderer
        // cannot tell a slow one from a hung one.
        return await runChatTurn(
          request,
          (progress) => event.sender.send('ai:chatProgress', progress),
          turn.signal
        )
      } finally {
        // Only if it is still ours. A turn that was superseded above must not
        // delete the entry belonging to the one that replaced it.
        if (chatTurns.get(event.sender.id) === turn) chatTurns.delete(event.sender.id)
      }
    }
  )

  ipcMain.handle('ai:cancelChat', (event): boolean => {
    const turn = chatTurns.get(event.sender.id)
    turn?.abort()
    return turn !== undefined
  })

  ipcMain.handle('manuscript:close', (): void => closeManuscript())

  ipcMain.handle('plan:read', (_event, project: Project): Promise<PlanDocument> =>
    readPlan(project)
  )

  ipcMain.handle('plan:write', (_event, project: Project, plan: PlanDocument): Promise<PlanDocument> =>
    writePlan(project, plan)
  )

  ipcMain.handle(
    'plan:createScene',
    (_event, project: Project, plan: PlanDocument, chapterId: string, title: string) =>
      createPlanScene(project, plan, chapterId, title)
  )

  ipcMain.handle('stats:read', (_event, project: Project): Promise<StatsDocument> =>
    readStats(project)
  )

  ipcMain.handle(
    'stats:write',
    (_event, project: Project, doc: StatsDocument): Promise<WriteStatsResult> =>
      writeStats(project, doc)
  )

  ipcMain.handle('stats:uses', (_event, project: Project, name: string): Promise<NameUse[]> =>
    findNameUses(project, name)
  )

  ipcMain.handle('media:read', (_event, project: Project): Promise<MediaDocument> =>
    readMedia(project)
  )

  ipcMain.handle('media:write', (_event, project: Project, doc: MediaDocument): Promise<void> =>
    writeMedia(project, doc)
  )

  ipcMain.handle('media:scan', (_event, project: Project): Promise<MediaFile[]> =>
    scanMedia(project)
  )

  ipcMain.handle(
    'media:deleteFile',
    (_event, project: Project, file: string): Promise<void> => deleteMediaFile(project, file)
  )

  ipcMain.handle(
    'media:importLook',
    async (_event, project: Project, request: ImportLookRequest): Promise<ImportLookResult> => {
      const chosen = await chooseUploadFile(`Choose a file for ${request.asset}`, [
        { name: 'Pictures, clips and audio', extensions: IMPORTABLE }
      ])

      if (chosen === null) {
        return { ok: false, cancelled: true, file: null, moved: [], message: '' }
      }

      return importLook(project, request, chosen)
    }
  )

  ipcMain.handle(
    'media:cutout',
    (_event, project: Project, request: CutoutRequest): Promise<CutoutResult> =>
      cutoutLook(project, request)
  )

  ipcMain.handle('media:reveal', async (_event, project: Project): Promise<void> => {
    // Created first: revealing a folder that does not exist opens nothing and
    // looks broken, and this is the only route by which files arrive.
    const path = join(project.path, MEDIA_DIR)
    await mkdir(path, { recursive: true })
    await shell.openPath(path)
  })

  ipcMain.handle('npcs:read', (_event, project: Project): Promise<NpcDocument> =>
    readNpcs(project)
  )

  ipcMain.handle(
    'npcs:write',
    (_event, project: Project, doc: NpcDocument): Promise<WriteNpcsResult> =>
      writeNpcs(project, doc)
  )

  ipcMain.handle('map:read', (_event, project: Project): Promise<MapDocument> => readMap(project))

  ipcMain.handle('map:write', (_event, project: Project, doc: MapDocument): Promise<void> =>
    writeMap(project, doc)
  )

  ipcMain.handle('map:destinations', (_event, project: Project): Promise<KnotSource[]> =>
    listDestinations(project)
  )

  ipcMain.handle('game:read', (_event, project: Project): Promise<GameDocument> =>
    readGame(project)
  )

  ipcMain.handle(
    'game:write',
    (_event, project: Project, doc: GameDocument): Promise<void> => writeGame(project, doc)
  )

  ipcMain.handle('gallery:read', (_event, project: Project): Promise<GalleryDocument> =>
    readGallery(project)
  )

  ipcMain.handle(
    'gallery:write',
    (_event, project: Project, doc: GalleryDocument): Promise<void> => writeGallery(project, doc)
  )

  ipcMain.handle('achievements:read', (_event, project: Project): Promise<AchievementDocument> =>
    readAchievements(project)
  )

  ipcMain.handle(
    'achievements:write',
    (_event, project: Project, doc: AchievementDocument): Promise<void> =>
      writeAchievements(project, doc)
  )

  ipcMain.handle('minigames:read', (_event, project: Project): Promise<MinigameDocument> =>
    readMinigames(project)
  )

  ipcMain.handle(
    'minigames:write',
    (_event, project: Project, doc: MinigameDocument): Promise<void> =>
      writeMinigames(project, doc)
  )

  ipcMain.handle(
    'project:check',
    (_event, project: Project): Promise<ProjectCheck> => checkProject(project)
  )

  ipcMain.handle(
    'media:usage',
    (_event, project: Project): Promise<MediaUsage> => mediaUsage(project)
  )

  ipcMain.handle(
    'search:ink',
    (_event, project: Project, request: SearchRequest): Promise<SearchResult> =>
      searchInk(project, request)
  )

  ipcMain.handle(
    'bundle:export',
    (_event, project: Project, outDir: string): Promise<BundleExportResult> =>
      exportBundle(project, outDir)
  )

  ipcMain.handle(
    'bundle:exportDesktop',
    (
      event,
      project: Project,
      outDir: string,
      options: DesktopExportOptions
    ): Promise<DesktopExportResult> =>
      exportDesktop(project, outDir, options, desktopTools(playerDir()), (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('bundle:desktopProgress', progress)
      })
  )

  ipcMain.handle('bundle:generateProtection', (): ReturnType<typeof generateProjectProtection> =>
    generateProjectProtection()
  )

  ipcMain.handle(
    'bundle:installProtection',
    (_event, profile: Project['protection']): ReturnType<typeof installProjectProtection> => {
      if (!profile) return Promise.resolve({ ok: false, message: 'This project has no release key.' })
      return installProjectProtection(profile)
    }
  )

  ipcMain.handle(
    'bundle:chooseDir',
    async (_event, current: string | null): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: 'Export bundle to',
        // `createDirectory` matters more than usual here: the destination is
        // typically a folder inside a game that does not exist yet.
        properties: ['openDirectory', 'createDirectory'],
        ...(current === null ? {} : { defaultPath: current })
      })

      return result.canceled ? null : (result.filePaths[0] ?? null)
    }
  )

  ipcMain.handle('bundle:reveal', async (_event, outDir: string): Promise<void> => {
    await shell.openPath(outDir)
  })

  /*
   * Packaging, and opening a package.
   *
   * Both dialogs are native and both live here rather than in the renderer,
   * for the ordinary reason: the renderer is sandboxed and has no filesystem.
   * `openPackage` deliberately takes a path the author picked in a native
   * dialog rather than one the renderer chose, so the only files this reads
   * are files somebody pointed at.
   */
  ipcMain.handle(
    'package:choosePath',
    async (_event, project: Project): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: 'Package project as',
        defaultPath: packageFileName(project),
        filters: [{ name: 'Project package', extensions: ['zip'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      })
      return result.canceled ? null : (result.filePath ?? null)
    }
  )

  ipcMain.handle(
    'package:write',
    async (_event, project: Project, libraryIds: string[], file: string): Promise<PackageResult> => {
      const libraries = (await listLibraries(librariesDir())).filter((one) =>
        libraryIds.includes(one.id)
      )
      return packageProject(project, libraries, file)
    }
  )

  ipcMain.handle('package:choose', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Open a project package',
      filters: [{ name: 'Project package', extensions: ['zip'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('package:preview', async (_event, file: string): Promise<PackagePreview> => {
    await ensureWorkspace()
    return previewPackage(file, dataDir())
  })

  ipcMain.handle('package:open', async (_event, file: string): Promise<PackageImportResult> => {
    await ensureWorkspace()
    return importPackage(file, dataDir())
  })

  ipcMain.handle('settings:load', (): Promise<AppSettings> => loadSettings())

  ipcMain.handle('settings:setInterfaceScale', async (event, scale: number): Promise<AppSettings> => {
    const settings = await setInterfaceScale(scale)
    event.sender.setZoomFactor(settings.interfaceScale)
    return settings
  })

  ipcMain.handle('settings:setComfyBaseUrl', (_event, url: string): Promise<AppSettings> =>
    setComfyBaseUrl(url)
  )

  ipcMain.handle('settings:setComfyWorkflowDir', (_event, dir: string | null): Promise<AppSettings> =>
    setComfyWorkflowDir(dir)
  )

  ipcMain.handle('settings:setComfyTimeout', (_event, seconds: number): Promise<AppSettings> =>
    setComfyTimeout(seconds)
  )

  ipcMain.handle(
    'settings:setComfyPromptPrefix',
    (_event, workflow: string, prefix: string | null): Promise<AppSettings> =>
      setComfyPromptPrefix(workflow, prefix)
  )

  ipcMain.handle(
    'settings:setComfyBinding',
    (_event, workflow: string, slot: BindingSlot, at: NodeField | null): Promise<AppSettings> =>
      setComfyBinding(workflow, slot, at)
  )

  ipcMain.handle(
    'settings:clearComfyBinding',
    (_event, workflow: string, slot: BindingSlot): Promise<AppSettings> =>
      clearComfyBinding(workflow, slot)
  )

  ipcMain.handle(
    'settings:setComfyDefault',
    (_event, role: WorkflowRole, workflow: string | null): Promise<AppSettings> =>
      setComfyDefault(role, workflow)
  )

  ipcMain.handle(
    'settings:setComfyRole',
    (_event, workflow: string, role: WorkflowRole | null): Promise<AppSettings> =>
      setComfyRole(workflow, role)
  )

  ipcMain.handle(
    'settings:setPrompt',
    (_event, kind: PromptKind, text: string | null): Promise<AppSettings> => setPrompt(kind, text)
  )

  /**
   * The prompts as the app writes them, for the settings screen to show.
   *
   * Assembled here rather than exported as constants, because the assistant's
   * is a function of the project it is looking at. With no project it reads as
   * it does on a fresh launch, which is the honest thing to show beside an
   * empty box.
   */
  ipcMain.handle(
    'settings:promptDefaults',
    async (): Promise<PromptDefaults> => ({
      prose: SYSTEM_PROMPT,
      ink: INK_SYSTEM_PROMPT,
      assistant: chatSystemPrompt(null)
    })
  )

  /* The author's ComfyUI --------------------------------------------------- */

  ipcMain.handle('comfy:test', async (): Promise<ComfyTestResult> => {
    const { comfy } = await loadSettings()
    return testComfy(comfy.baseUrl)
  })

  ipcMain.handle('comfy:chooseDir', async (): Promise<string | null> => {
    const chosen = await dialog.showOpenDialog({
      title: 'Choose the folder your exported workflows are in',
      properties: ['openDirectory']
    })
    return chosen.canceled ? null : (chosen.filePaths[0] ?? null)
  })

  ipcMain.handle('comfy:workflows', async (): Promise<WorkflowListResult> => {
    const { comfy } = await loadSettings()
    return listWorkflows(comfy.workflowDir, comfy)
  })

  /* The connected player ------------------------------------------------- */

  ipcMain.handle(
    'player:open',
    (_event, previewId?: string | null, minigame?: string | null): Promise<void> =>
      openPlayer(previewId ?? null, minigame ?? null)
  )

  /**
   * Export into the player, then make sure it is running.
   *
   * In that order, and only that order: a server started before the bundle
   * exists serves a folder that is not there, and the author reloads onto an
   * error that has already been fixed by the time they read it.
   */
  ipcMain.handle(
    'player:preview',
    async (_event, project: Project, target: string | null = null): Promise<PreviewResult> => {
      let outDir: string | null = null
      try {
        const check = await checkPlayer(playerDir())
        if (!check.ok) {
          return { ok: false, outDir: null, url: null, previewId: null, problem: check.problem }
        }

        outDir = previewDir()
        const previewId = randomUUID()
        const exported = await exportBundle(project, outDir, { preview: { id: previewId, target } })
        if (!exported.ok) {
          const first =
            exported.diagnostics.find((one) => one.severity === 'error')?.message ??
            exported.warnings[0] ??
            'The story did not compile.'
          return { ok: false, outDir, url: null, previewId: null, problem: first }
        }

        const status = await startPlayer(playerDir())
        if (!status.url) {
          return {
            ok: false,
            outDir,
            url: null,
            previewId: null,
            problem: status.lines.at(-1) ?? 'The player did not start.'
          }
        }

        return { ok: true, outDir, url: playerUrl(status.url, previewId), previewId, problem: null }
      } catch (error) {
        return {
          ok: false,
          outDir,
          url: null,
          previewId: null,
          problem: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle(
    'settings:saveProviders',
    (_event, providers: Provider[], activeProviderId: string | null): Promise<AppSettings> =>
      saveProviders(providers, activeProviderId)
  )

  ipcMain.handle('settings:createProvider', (_event, label: string): Promise<AppSettings> =>
    createProvider(label)
  )

  ipcMain.handle('settings:deleteProvider', (_event, providerId: string): Promise<AppSettings> =>
    deleteProvider(providerId)
  )

  // Write-only by design: no handler ever returns a key to the renderer.
  ipcMain.handle(
    'settings:setApiKey',
    (_event, providerId: string, key: string | null): Promise<AppSettings> =>
      setApiKey(providerId, key)
  )

  ipcMain.handle('settings:testProvider', (_event, providerId: string): Promise<ConnectionTestResult> =>
    testProvider(providerId)
  )

  ipcMain.handle('settings:listModels', (_event, providerId: string): Promise<ModelListResult> =>
    listModels(providerId)
  )
}
