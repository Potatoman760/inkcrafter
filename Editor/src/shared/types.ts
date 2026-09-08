import type {
  WriteInkRequest,
  WriteInkResult,
  WriteSectionRequest,
  WriteSectionResult
} from './ai'
import type { ChatProgress, ChatTurnRequest, ChatTurnResult } from './chat'
import type { KnotSource } from './inkKnots'
import type { InkReference } from './inkRefs'
import type { PreviewResult } from './player'
import type { Preflight } from './bundle/preflight'
import type { GameDocument } from './bundle/gameDoc'
import type {
  BindingSlot,
  ComfyTestResult,
  NodeField,
  WorkflowListResult,
  WorkflowRole
} from './comfy'
import type { CodexEntry } from './codex'
import type { Manuscript } from './manuscript'
import type { TagCommand } from './bundle/tagSpec'
import type { PromptDefaults, PromptKind } from './prompts'
import type { PlanDocument } from './planDoc'
import type { MediaDocument, MediaKind } from './mediaDoc'
import type { BundleExportResult } from './bundle/result'
import type { DesktopExportOptions, DesktopExportProgress, DesktopExportResult } from './desktop'
import type {
  PackageImportResult,
  PackagePreview,
  PackageResult
} from './projectPackage'
import type { StatsDocument } from './statsDoc'
import type { NpcDocument } from './bundle/npcDoc'
import type { MapDocument } from './bundle/mapDoc'
import type { GalleryDocument } from './bundle/galleryDoc'
import type { AchievementDocument } from './bundle/achievementDoc'
import type { MinigameDocument } from './bundle/minigameDoc'
import type { CodexLibrary, Project, ProjectFile, ProjectProtection } from './project'
import type {
  AppSettings,
  ConnectionTestResult,
  MenuAction,
  ModelListResult,
  Provider
} from './settings'

export type DiagnosticSeverity = 'error' | 'warning' | 'todo'

export interface InkDiagnostic {
  severity: DiagnosticSeverity
  message: string
  /** Absolute path of the file the diagnostic came from, when ink reported one. */
  file: string | null
  /** 1-based line number, when ink reported one. */
  line: number | null
  /** The original, unparsed message from the compiler. */
  raw: string
}

/** One tag naming a media asset, and where it sits. */
export interface MediaUse {
  /** Project-relative path, so a row can also open. */
  file: string
  /** 1-based. */
  line: number
  /** The knot the tag sits in, or null for a tag above the first one. */
  knot: string | null
  /** The look the tag named, when it named one. */
  variant: string | null
  /** The tag as written, without the `#`. */
  raw: string
}

/** Uses keyed by media kind and name — `background:harbour`, `music:the_grove`. */
export type MediaUsage = Record<string, MediaUse[]>

/** What a whole-project check found, from `project:check`. */
export interface ProjectCheck {
  /** The compiler's own errors and warnings: whether the ink is ink. */
  diagnostics: InkDiagnostic[]
  /**
   * Whether what the ink names exists — sprites, stats, cast, minigames.
   * These compile perfectly and fail at runtime, so nothing else reports them.
   */
  problems: Preflight[]
  /** How many ink files the compile reached, for saying what was checked. */
  files: number
}

export interface CompileRequest {
  /** Absolute path of the root file to compile — usually the project's entry point. */
  filePath: string | null
  /**
   * Full text of the root file. Omit to read it from disk, which is what the
   * editor does when the file it is showing is not the root.
   */
  source?: string
  /**
   * Unsaved buffers by absolute path, consulted before disk.
   *
   * A chapter file usually diverts into the next chapter, so compiling it alone
   * reports every hand-off as a missing target. The editor compiles the whole
   * story instead and supplies the buffer it is showing through here.
   */
  overrides?: Record<string, string>
}

export interface CompileResult {
  ok: boolean
  /** Compiled story JSON, ready to hand to `new Story(json)`. Null when compilation failed. */
  storyJson: string | null
  diagnostics: InkDiagnostic[]
  /** Wall-clock compile time in ms, for the status bar. */
  durationMs: number
  /**
   * Absolute paths the compiler actually read, root included. Lets the caller
   * tell whether the file it cares about was part of this compile at all.
   */
  filesRead: string[]
}

export interface ProjectApi {
  list(): Promise<Project[]>
  create(title: string): Promise<Project>
  save(project: Project): Promise<void>
  /** Every `.ink` file the project owns. */
  files(project: Project): Promise<ProjectFile[]>
  /** Creates an empty story inside the project. Returns its project-relative path. */
  addFile(project: Project, path: string): Promise<string>
  /**
   * Every folder that could hold ink, listed separately from the files.
   *
   * A folder with nothing in it cannot be inferred from a list of paths, and an
   * empty folder is exactly what you have between making one and filling it.
   */
  folders(project: Project): Promise<string[]>
  addFolder(project: Project, path: string): Promise<string>
  /**
   * Renames or moves one ink file, following everything that named it — the
   * INCLUDE lines in other files, the entry point, the plan's attachments, and
   * the moved file's own includes. Returns where it landed and what else was
   * rewritten, so the app can reload it.
   */
  moveFile(project: Project, from: string, to: string): Promise<InkMoveResult>
  /**
   * Copies a file into a folder, under a free name. Nothing else is rewritten:
   * a copy is a new file that nothing points at yet.
   */
  copyFile(project: Project, from: string, toFolder: string): Promise<InkMoveResult>
  /** What points at a file, or at anything inside a folder. Ask before deleting. */
  references(project: Project, path: string): Promise<InkReference[]>
  /** Deletes a file, or a folder and its contents. Refuses nothing: ask first. */
  deleteFile(project: Project, path: string): Promise<void>
  reveal(project: Project): Promise<void>
}

export interface InkMoveResult {
  path: string
  /** Project-relative paths of everything else that changed. */
  written: string[]
}

export interface LibraryApi {
  list(): Promise<CodexLibrary[]>
  create(title: string): Promise<CodexLibrary>
  save(library: CodexLibrary): Promise<void>
  reveal(libraryId: string): Promise<void>
}

export interface CodexApi {
  /** Entries from every listed library, in one flat list. */
  load(libraryIds: string[]): Promise<CodexEntry[]>
  /**
   * `names` maps entry id to display name, and is used only to regenerate the
   * human-readable comments beside relation ids. Display is the renderer's
   * concern and it already holds every entry, so it supplies the map.
   */
  save(entry: CodexEntry, names: Record<string, string>): Promise<void>
  remove(entry: CodexEntry): Promise<void>
  /** Moves the entry's file within its library. Its id, and every link, is unaffected. */
  move(entry: CodexEntry, toFile: string): Promise<void>
  /**
   * How often each entry is named across every ink file, keyed by entry id.
   *
   * Entries are passed in rather than read here: the renderer holds them, and
   * they may carry aliases the author has typed but not yet saved.
   */
  mentionCounts(project: Project, request: MentionCountRequest): Promise<Record<string, number>>
}

export interface MentionCountRequest {
  entries: CodexEntry[]
  /**
   * Unsaved buffers by absolute path, consulted before disk — so the count
   * follows the prose being typed rather than the last save. Same contract as
   * `CompileRequest.overrides`.
   */
  overrides?: Record<string, string>
}

export interface ManuscriptApi {
  /** Compiles the entry point from disk and reads up to the first junction. */
  open(project: Project, entryPath: string): Promise<Manuscript>
  /**
   * Chooses at a junction. Choosing at an earlier one discards every node after
   * it, because the story that followed described a path no longer taken.
   */
  choose(nodeId: string, choiceIndex: number): Promise<Manuscript>
  /** Recompiles from disk and replays the recorded path. */
  reread(): Promise<Manuscript>
  /**
   * Rewrites the ink behind a line. `choiceIndex` selects a choice within a
   * junction, or is null to edit a prose paragraph. The ink file is the save
   * format for both views, so this replaces a span rather than regenerating.
   */
  edit(
    nodeId: string,
    choiceIndex: number | null,
    text: string
  ): Promise<{ manuscript: Manuscript; error: string | null }>
  /**
   * Fills the manuscript with a path that reaches `knot`. Where several routes
   * reach it, the shortest is taken.
   *
   * When nothing reaches it the reading begins further back instead of failing,
   * and `startedAt` names the knot it had to begin at.
   */
  traceTo(
    project: Project,
    entryPath: string,
    knot: string
  ): Promise<{
    manuscript: Manuscript
    steps: number
    startedAt: string | null
    error: string | null
  }>
  /** Whether a section's source span can be overwritten wholesale. */
  sectionReplaceable(sectionIndex: number): Promise<{ safe: boolean; reason: string | null }>
  /**
   * Stages a section: writes one `#` tag into the ink behind it.
   *
   * Replaces the tag already speaking about the same subject — the background,
   * or that one character — and adds one at the top of the section when nothing
   * does. The manuscript comes back recompiled, because the write moves every
   * line number after it.
   */
  setSectionTag(
    sectionIndex: number,
    command: TagCommand,
    /** A tag to rewrite, by its exact text — how editing a row differs from adding one. */
    replacing?: string
  ): Promise<{ manuscript: Manuscript; error: string | null }>
  /**
   * Takes one tag out of a section, named by exactly the text in the file.
   *
   * Raw rather than parsed: the ink is the save format, and a tag put back
   * through `formatTag` may not be the characters actually written.
   */
  clearSectionTag(
    sectionIndex: number,
    raw: string
  ): Promise<{ manuscript: Manuscript; error: string | null }>
  /** Puts drafted prose into the ink, then recompiles and replays the path. */
  compose(
    sectionIndex: number,
    mode: 'insert' | 'replace',
    text: string
  ): Promise<{ manuscript: Manuscript; error: string | null }>
  close(): Promise<void>
}

export interface PlanApi {
  /**
   * An empty plan when the project has none. A project written before the plan
   * was JSON has its `outline.md` imported once, here.
   */
  read(project: Project): Promise<PlanDocument>
  /** Saves after enforcing Scene ownership and creating any missing Scene files. */
  write(project: Project, plan: PlanDocument): Promise<PlanDocument>
  /** Creates a Scene and its Ink file as one app-managed operation. */
  createScene(
    project: Project,
    plan: PlanDocument,
    chapterId: string,
    title: string
  ): Promise<{ plan: PlanDocument; file: string; written: string[] }>
}

/** One line of ink mentioning an identifier, for a rename to report. */
export interface NameUse {
  /** Project-relative path. */
  path: string
  line: number
  /** The line itself, trimmed, for showing in the list. */
  text: string
}

export interface StatsApi {
  read(project: Project): Promise<StatsDocument>
  /**
   * Saves the catalogue *and* regenerates `ink/state.ink` from it, adding the
   * INCLUDE to the entry point if it is missing. Returns the project-relative
   * paths written, so the renderer can reload whatever it is showing.
   */
  write(project: Project, doc: StatsDocument): Promise<{ written: string[] }>
  /**
   * Every line of the project's ink mentioning an identifier, so a rename can
   * say what it is about to break. Generated files are excluded.
   */
  uses(project: Project, name: string): Promise<NameUse[]>
}

/** An image found under a project's `media/`. */
export interface MediaFile {
  /** Relative to `media/`, e.g. `sprites/wren-happy.png`. */
  path: string
  bytes: number
  /** An `app://` URL the renderer can put straight in an `<img>`. */
  url: string
}

/** Bringing one picture in from outside the workspace. */
export interface ImportLookRequest {
  kind: MediaKind
  /** The asset's ink name, which is also its folder. */
  asset: string
  /** The look the picture becomes, which is also its file name. */
  look: string
  /**
   * The asset's existing looks, so they can be gathered into its folder while
   * we are there. Sent by the renderer rather than read in main: the renderer
   * holds the catalogue, and re-reading it here would race its autosave.
   */
  gather: string[]
}

export interface ImportLookResult {
  ok: boolean
  /** True when the author closed the file dialog. Not a failure. */
  cancelled: boolean
  /** Where the new look landed, relative to `media/`. */
  file: string | null
  /** Looks that moved on the way, for the catalogue to follow. */
  moved: { from: string; to: string }[]
  message: string
}

/**
 * How much of the white card to take out.
 *
 * Mirrors `KeyMode` in `main/backgroundKey.ts`, which is where it is explained.
 * Repeated rather than imported because `shared/` may not reach into `main/`.
 */
export type CutoutMode = 'edge' | 'gaps'

/** Taking the white card out from behind one look. */
export interface CutoutRequest {
  /** The look's current file, relative to `media/`. */
  file: string
  /** Reachable card only, or card the art has closed around as well. */
  mode?: CutoutMode
  /**
   * How far from the border's own colour still counts as card, in levels.
   * Left out on the button; the assistant may raise it for a grainy scan.
   */
  tolerance?: number
}

export interface CutoutResult {
  ok: boolean
  /**
   * The keyed picture, relative to `media/`, for the look to be repointed at.
   * Always a new file — the original is never rewritten, because the workspace
   * has no undo and an `app://` URL carries no version, so a file replaced
   * under its own name may go on showing the pixels it had.
   */
  file: string | null
  /** `#fbfaf7`: the colour actually removed, or null if it never got that far. */
  colour: string | null
  /** Pixels taken out entirely, and pixels given a partial alpha at the edge. */
  cleared: number
  feathered: number
  /** How many of the cleared pixels were gaps the art had closed around. */
  enclosed: number
  /** Why not, when `ok` is false. Empty otherwise. */
  message: string
}

export interface MediaApi {
  read(project: Project): Promise<MediaDocument>
  write(project: Project, doc: MediaDocument): Promise<void>
  /**
   * Every image on disk under `media/`, catalogued or not. Files arrive by
   * being put there, so this is how the app learns about them.
   */
  scan(project: Project): Promise<MediaFile[]>
  /** Permanently removes one unclaimed file from the project's media folder. */
  deleteFile(project: Project, file: string): Promise<void>
  /** Opens `media/` in the OS file manager, one of the ways files get added. */
  reveal(project: Project): Promise<void>
  /**
   * Asks for a picture and copies it in as one look.
   *
   * The catalogue is left to the caller: this reports where the file landed
   * and what else moved, and the renderer — which holds the document — is what
   * writes it down.
   */
  importLook(project: Project, request: ImportLookRequest): Promise<ImportLookResult>
  /**
   * Takes the white card out from behind a look and writes the result beside it.
   *
   * The catalogue is left to the caller, as with `importLook`: this reports
   * where the keyed picture landed and the renderer repoints the look at it.
   */
  cutout(project: Project, request: CutoutRequest): Promise<CutoutResult>
}

export interface NpcsApi {
  read(project: Project): Promise<NpcDocument>
  /**
   * Saves the cast *and* regenerates `ink/state.ink`, which holds the
   * declarations from this catalogue and the stats one together.
   */
  write(project: Project, doc: NpcDocument): Promise<{ written: string[] }>
}

/**
 * What changed under the open project, since the app last looked.
 *
 * Split by what the renderer has to do about it rather than by what happened:
 * a catalogue is reloaded outright, an ink file may be open and being edited,
 * and everything else only matters because the file list may have moved.
 */
export interface WorkspaceChange {
  /** Project-relative paths of `.ink` files added, changed or removed. */
  ink: string[]
  /** Project-relative names of the catalogue documents, `media.json` and its siblings. */
  catalogues: string[]
  /** Everything else under the project: pictures, notes, anything an author keeps there. */
  other: string[]
}

export interface WatchApi {
  /**
   * Watches one project, or stops watching when given null. One at a time:
   * the app has one project open, and watching a closed one would report
   * changes nothing on screen is showing.
   */
  project(project: Project | null): Promise<void>
  /**
   * Subscribes to changes under the watched project. Returns an unsubscribe
   * function so React effect cleanup can detach the listener.
   */
  onChange(handler: (change: WorkspaceChange) => void): () => void
}

export interface MapApi {
  read(project: Project): Promise<MapDocument>
  /** Generates no ink: a map is read by the game, never by the compiler. */
  write(project: Project, doc: MapDocument): Promise<void>
  /**
   * Every knot a place could travel to, with the file that declares it. Scanned
   * rather than compiled, so a map can be laid out while the story around it is
   * still half-written — and the file is what says which Scene a knot belongs
   * to, since a Scene owns its ink file rather than its knot names.
   */
  destinations(project: Project): Promise<KnotSource[]>
}

export interface GameApi {
  read(project: Project): Promise<GameDocument>
  /** Generates no ink; the player reads this from the exported bundle. */
  write(project: Project, doc: GameDocument): Promise<void>
}

export interface GalleryApi {
  read(project: Project): Promise<GalleryDocument>
  /** Generates no ink; the player reads this catalogue from the exported bundle. */
  write(project: Project, doc: GalleryDocument): Promise<void>
}

export interface AchievementsApi {
  read(project: Project): Promise<AchievementDocument>
  /** Generates no ink; the player observes the globals named by this catalogue. */
  write(project: Project, doc: AchievementDocument): Promise<void>
}

export interface MinigamesApi {
  read(project: Project): Promise<MinigameDocument>
  write(project: Project, doc: MinigameDocument): Promise<void>
}

export interface BundleApi {
  /**
   * Compiles the project and writes a runnable bundle to `outDir`.
   *
   * Refuses rather than half-writes: a story with a compile error produces
   * diagnostics and no files, because the whole promise of a bundle is that a
   * player can load it without checking.
   */
  export(project: Project, outDir: string): Promise<BundleExportResult>
  /**
   * The same story as a folder that runs on its own: the player, Electron and
   * the bundle, once per platform asked for. Progress arrives through
   * `onDesktopProgress`, because building and fetching take long enough that
   * a dialog saying only "Exporting…" would look hung.
   */
  exportDesktop(
    project: Project,
    outDir: string,
    options: DesktopExportOptions
  ): Promise<DesktopExportResult>
  onDesktopProgress(handler: (progress: DesktopExportProgress) => void): () => void
  /** Creates a release keypair; only its public export profile crosses into the renderer. */
  generateProtection(): Promise<ProjectProtection>
  /** Copies the private half from secure local storage into the connected player's keyring. */
  installProtection(profile: ProjectProtection): Promise<{ ok: boolean; message: string }>
  /** A native folder picker, returning null when the author cancels. */
  chooseDir(current: string | null): Promise<string | null>
  reveal(outDir: string): Promise<void>
}

/**
 * A project and its codex libraries as one file, and the way back.
 *
 * Both file dialogs are native and belong to main, so the renderer never names
 * a path of its own: it asks for one to be chosen, then hands that same path
 * back. A package is read twice — once to say what is in it, and again to
 * unpack it — because what opening one will do to the workspace is worth
 * saying before it happens rather than after.
 */
export interface PackagesApi {
  /** Native save dialog, defaulting to a name made from the project's title. */
  choosePath(project: Project): Promise<string | null>
  write(project: Project, libraryIds: string[], file: string): Promise<PackageResult>
  /** Native open dialog. Null when the author cancels. */
  choose(): Promise<string | null>
  /** What is in a package, and what opening it would do. Writes nothing. */
  preview(file: string): Promise<PackagePreview>
  open(file: string): Promise<PackageImportResult>
}

export interface AiApi {
  /** Drafts the prose of one section. Runs in the main process, where the key is. */
  writeSection(request: WriteSectionRequest): Promise<WriteSectionResult>
  /**
   * Drafts ink for the editor: choices and structure, not only prose.
   *
   * Takes the project explicitly. The editor does not need a manuscript open,
   * so unlike `writeSection` there is no session in the main process to ask.
   */
  writeInk(request: WriteInkRequest, project: Project): Promise<WriteInkResult>
  /**
   * One turn of the assistant, including any tool calls it makes along the way.
   * The whole loop runs in main: the renderer must not be handed the filesystem
   * on a remote service's say-so, and has never held the key either.
   */
  chat(request: ChatTurnRequest): Promise<ChatTurnResult>
  /**
   * Reports tool calls as they happen, so a long turn shows its working rather
   * than looking hung. Returns an unsubscribe function.
   */
  onChatProgress(handler: (progress: ChatProgress) => void): () => void
  /**
   * Stops the turn this window has in flight.
   *
   * Resolves as soon as the turn has been told to stop, not when it has: a tool
   * already running is allowed to finish, so `chat` may take a few more seconds
   * to settle. It resolves false when there was nothing running.
   */
  cancelChat(): Promise<boolean>
}

export interface SettingsApi {
  load(): Promise<AppSettings>
  /** Scales the complete authoring interface and remembers it for future launches. */
  setInterfaceScale(scale: number): Promise<AppSettings>
  /** Saves everything but the keys, which have their own write-only path. */
  saveProviders(providers: Provider[], activeProviderId: string | null): Promise<AppSettings>
  createProvider(label: string): Promise<AppSettings>
  deleteProvider(providerId: string): Promise<AppSettings>
  /**
   * Write-only. Pass null to clear. There is deliberately no matching read:
   * a key is never sent to the renderer, so nothing rendered there can leak one.
   */
  setApiKey(providerId: string, key: string | null): Promise<AppSettings>
  testProvider(providerId: string): Promise<ConnectionTestResult>
  /** The provider's available models, for the model picker. */
  listModels(providerId: string): Promise<ModelListResult>
  /** Points the app at a player checkout, or clears it with null. */
  /** Where ComfyUI answers. A malformed address is refused, not stored. */
  setComfyBaseUrl(url: string): Promise<AppSettings>
  /** The folder of exported workflows, or null to forget it. */
  setComfyWorkflowDir(dir: string | null): Promise<AppSettings>
  /** How long one generation may take, clamped to something sane. */
  setComfyTimeout(seconds: number): Promise<AppSettings>
  /** Text prepended to one workflow's positive prompt. Null clears it. */
  setComfyPromptPrefix(workflow: string, prefix: string | null): Promise<AppSettings>
  /**
   * Repoints one slot of one workflow, keyed by its file name.
   *
   * `null` means "leave this slot unbound", which is a different instruction
   * from having no opinion — that is `clearComfyBinding`.
   */
  setComfyBinding(workflow: string, slot: BindingSlot, at: NodeField | null): Promise<AppSettings>
  /** Forgets a correction, so the slot goes back to whatever is detected. */
  clearComfyBinding(workflow: string, slot: BindingSlot): Promise<AppSettings>
  /**
   * Which workflow a role reaches for when the assistant names none. Null
   * forgets the choice, putting it back to the first of that kind.
   */
  setComfyDefault(role: WorkflowRole, workflow: string | null): Promise<AppSettings>
  /** What a workflow is for. Null hands it back to what reading it suggests. */
  setComfyRole(workflow: string, role: WorkflowRole | null): Promise<AppSettings>
  /**
   * Changes one prompt, or puts it back. Null is "reset to default": the
   * override is cleared rather than the app's own text being copied in, so a
   * prompt improved later still reaches an author who never touched it.
   */
  setPrompt(kind: PromptKind, text: string | null): Promise<AppSettings>
  /**
   * What the app ships, for the editor to show against.
   *
   * Asked for on its own rather than carried on `AppSettings`: these are
   * thousands of words and only the settings screen wants them.
   */
  promptDefaults(): Promise<PromptDefaults>
}

/**
 * The author's local ComfyUI.
 *
 * Split from the settings above along the same line as the player: those write
 * what is remembered, these ask the world a question. Nothing here goes to
 * ComfyUI from the renderer — the packaged renderer runs under
 * `connect-src 'none'` and could not if it wanted to.
 */
export interface ComfyApi {
  /** Whether it answers, and enough about it to prove it is the right machine. */
  test(): Promise<ComfyTestResult>
  /** Native folder picker for the workflow folder. Null when cancelled. */
  chooseDir(): Promise<string | null>
  /** Every workflow in the folder, read, understood, and corrected. */
  workflows(): Promise<WorkflowListResult>
}

/**
 * The connected player.
 *
 * A dev server the app starts and stops, which is unlike everything else here:
 * the calls are about a process rather than a document, and its life is longer
 * than any one of them.
 */
export interface PlayerApi {
  /**
   * Exports the project into the player's game/preview and makes sure it runs.
   *
   * The only way in. `check`, `status` and `stop` were here for the Connected
   * player settings tab; with it gone, previewing reports its own problems and
   * the server is stopped on quit.
   */
  preview(project: Project, target?: string | null): Promise<PreviewResult>
  /** Opens the running preview in the default browser. */
  open(previewId?: string | null, minigame?: string | null): Promise<void>
}

/** The API surface exposed on `window.inkcrafter` by the preload script. */
export interface SearchRequest {
  query: string
  caseSensitive: boolean
  /** Reads `query` as a regular expression rather than as literal text. */
  regex: boolean
}

/** One occurrence. A line matching twice is two hits, as it is in any editor. */
export interface SearchHit {
  /** Project-relative path with `/` separators, so a hit is also something the tree can open. */
  file: string
  /** 1-based. */
  line: number
  /** Where the match starts *in `preview`*, which is not the line when the line was clipped. */
  column: number
  length: number
  /** The line, clipped around the match when it is too long to show whole. */
  preview: string
}

export interface SearchResult {
  hits: SearchHit[]
  /** The cap stopped the search early; there are more matches than these. */
  capped: boolean
  /** Why the query could not be run — a half-typed regex. Null when it ran. */
  problem: string | null
}

export interface SearchApi {
  ink(project: Project, request: SearchRequest): Promise<SearchResult>
}

export interface InkCrafterApi {
  compile(request: CompileRequest): Promise<CompileResult>
  readFile(filePath: string): Promise<string>
  saveFile(filePath: string, contents: string): Promise<void>
  projects: ProjectApi
  libraries: LibraryApi
  codex: CodexApi
  manuscript: ManuscriptApi
  plan: PlanApi
  stats: StatsApi
  media: MediaApi
  npcs: NpcsApi
  map: MapApi
  game: GameApi
  gallery: GalleryApi
  achievements: AchievementsApi
  minigames: MinigamesApi
  bundle: BundleApi
  packages: PackagesApi
  /** Whole-project reads that write nothing. */
  project: {
    check(project: Project): Promise<ProjectCheck>
    /** Where every catalogued asset is named in the ink. */
    mediaUsage(project: Project): Promise<MediaUsage>
  }
  search: SearchApi
  /** Changes to the project's files made by anything other than this app. */
  watch: WatchApi
  ai: AiApi
  settings: SettingsApi
  player: PlayerApi
  comfy: ComfyApi
  workspace: {
    dataDir(): Promise<string>
    reveal(): Promise<void>
  }
  /**
   * Subscribes to native menu commands. Returns an unsubscribe function so
   * React effect cleanup can detach the listener.
   */
  onMenuAction(handler: (action: MenuAction) => void): () => void

  /**
   * `process.platform`, as a value rather than an IPC call.
   *
   * The renderer only needs it to write a shortcut the way the reader's
   * keyboard does — `⌘K` or `Ctrl+K` — and `navigator.platform` is deprecated
   * and lies under emulation.
   */
  platform: string
}
