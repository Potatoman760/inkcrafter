import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MAX_SELECTION_CHARS,
  type ChatContext,
} from "@shared/chat";
import type { CodexEntry, CodexType } from "@shared/codex";
import { findMentions } from "@shared/mentions";
import { sectionsOf, type SourceAnchor } from "@shared/manuscript";
import {
  updatePlanNode,
  type PlanNode,
} from "@shared/planDoc";
import type { Project, ProjectFile } from "@shared/project";
import type { MenuAction } from "@shared/settings";
import { editorContextAt } from "@shared/inkContext";
import { findKnot } from "@shared/inkKnots";
import type { GuardedTextEdit } from "./editor/guardedEdit";
import type { CompileResult } from "@shared/types";
import { CodexEntryDialog } from "./codex/CodexEntryDialog";
import { ConflictDialog } from "./editor/ConflictDialog";
import { CodexPanel } from "./codex/CodexPanel";
import { LibraryDialog } from "./codex/LibraryDialog";
import { useCodex } from "./codex/useCodex";
import { InkEditor } from "./editor/InkEditor";
import { Splitter } from "./layout/Splitter";
import { usePaneWidth } from "./layout/usePaneWidth";
import {
  RIGHT_TABS,
  VIEW_LABELS,
  isWriteView,
  tabFor,
  tabLabel,
  type RightTab,
  type ViewMode,
} from "./layout/rightDock";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { wroteOpenProjectFile } from "./assistant/writtenFiles";
import { useAssistant } from "./assistant/useAssistant";
import { DebugPanel } from "./editor/DebugPanel";
import { InkContextMenu, type MenuTarget } from "./editor/InkContextMenu";
import { ExportDialog } from "./export/ExportDialog";
import { useGame } from "./manager/useGame";
import {
  GameManagerView,
  SECTION_FILES,
  type ManagerSection,
} from "./manager/GameManagerView";
import { useNpcs } from "./npcs/useNpcs";
import { useMap } from "./map/useMap";
import { useMedia } from "./media/useMedia";
import { useStats } from "./stats/useStats";
import { useGallery } from "./gallery/useGallery";
import { useAchievements } from "./achievements/useAchievements";
import { useMinigames } from "./minigames/useMinigames";
import { ManuscriptOutline } from "./manuscript/ManuscriptOutline";
import { PlanGrid } from "./plan/PlanGrid";
import { PlanImportDialog } from "./plan/PlanImportDialog";
import { PlanNodeDialog } from "./plan/PlanNodeDialog";
import { PlanMatrix } from "./plan/PlanMatrix";
import { PlanOutline } from "./plan/PlanOutline";
import { PlanStructure } from "./plan/PlanStructure";
import { usePlan } from "./plan/usePlan";
import { ManuscriptView } from "./manuscript/ManuscriptView";
import { useManuscript } from "./manuscript/useManuscript";
import { WritePanel } from "./manuscript/WritePanel";
import { StoryPlayer } from "./player/StoryPlayer";
import { FileTree } from "./project/FileTree";
import { SearchDialog } from "./search/SearchDialog";
import { ProjectPicker } from "./project/ProjectPicker";
import { ProjectDialog } from "./project/ProjectDialog";
import { useProject } from "./project/useProject";
import { SettingsDialog } from "./settings/SettingsDialog";
// Wide enough for a filter box and a nested file path; narrow enough to leave
// the reading column its measure. Shared with the stylesheet — see dimensions.ts.
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDE_DEFAULT,
  SIDE_MIN,
  SIDE_MAX,
  SPLITTER_WIDTH,
} from "./layout/dimensions";
import { Icon } from "./design/Icon";
import {
  Diagnostics,
  IconButton,
  StatusPill,
  Tabs,
  Toast,
  ToastStack,
  Toolbar,
  ToolbarBrand,
  ToolbarFile,
  ToolbarSpacer
} from "./design/components";
import { CommandPalette } from "./design/components/CommandPalette";
import { useToasts } from "./layout/useToasts";
import { Hint } from './design/components'

const COMPILE_DEBOUNCE_MS = 300;
/**
 * Longer than a compile's, because this reads every ink file and nothing waits
 * on the answer — a badge that settles a moment after the typing stops is not
 * something an author is watching for.
 */
const MENTION_DEBOUNCE_MS = 500;

/**
 * The views that need the catalogues loaded.
 *
 * All three of media, stats and cast are read to draw a scene rather than to
 * edit one, so any view that shows staging needs them: the game manager edits
 * them, the editor's preview draws from them, and the manuscript's section rail
 * both draws and writes them. A view left off this list sees empty catalogues
 * and says the story stages nothing, which reads as a bug in the story.
 */
const STAGED_VIEWS = new Set<ViewMode>(["game", "editor", "manuscript"]);


const EMPTY_RESULT: CompileResult = {
  ok: false,
  storyJson: null,
  diagnostics: [],
  durationMs: 0,
  filesRead: [],
};

type Sidebar = "files" | "codex";
/**
 * The right panel is a dock with the same tab set in every view — see
 * [rightDock.ts](./layout/rightDock.ts). What stays a dialog is configuration
 * and one-off actions: the app's settings, the project's, its libraries, the
 * codex entry editor, and exporting a bundle.
 */
/** Novelcrafter treats the outline as one of the plan views; so does this. */
type PlanMode = "grid" | "matrix" | "outline";

export function App(): React.JSX.Element {
  const session = useProject();
  const { project, files } = session;

  const [openFile, setOpenFile] = useState<ProjectFile | null>(null);
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;
  const projectRef = useRef(project);
  projectRef.current = project;
  const [source, setSource] = useState("");
  const [dirty, setDirty] = useState(false);
  /**
   * What the open file held on disk the last time this app read or wrote it.
   *
   * The baseline a watcher event is measured against: disk matching this is
   * our own save echoing back, and disk differing from it is somebody else's
   * work. Without it there is no way to tell a change from a save, because a
   * dirty buffer differs from disk either way.
   */
  const diskSource = useRef("");
  /** The open file, changed underneath a buffer with unsaved edits. */
  const [conflict, setConflict] = useState<{ path: string; theirs: string } | null>(null);
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  /** Current rather than captured, because an assistant turn outlives a render. */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [result, setResult] = useState<CompileResult>(EMPTY_RESULT);
  const [compiling, setCompiling] = useState(false);
  const [sidebar, setSidebar] = useState<Sidebar>("files");
  const [rightTab, setRightTab] = useState<RightTab>("preview");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  /** The entry open in the editing dialog, which floats above either view. */
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [librariesOpen, setLibrariesOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth, commitSidebarWidth] = usePaneWidth(
    "inkcrafter.sidebarWidth",
    SIDEBAR_DEFAULT,
  );
  const [sideWidth, setSideWidth, commitSideWidth] = usePaneWidth(
    "inkcrafter.sideWidth",
    SIDE_DEFAULT,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Which catalogue the Game view is showing. */
  const [managerSection, setManagerSection] = useState<ManagerSection>("media");
  /** Where the ink editor was right-clicked, or null. */
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  /** A one-shot editor transaction guarded by the source it was built from. */
  const [inkEdit, setInkEdit] = useState<GuardedTextEdit | null>(null);
  /** What is selected in the ink editor, for the panel that drafts into it. */
  /**
   * The section the cursor is in, so the preview can play that rather than the
   * story from the top. Reset when the file changes: a knot from the last file
   * is not in this one, and the preview would fall back with a message about a
   * name the author has not looked at in a while.
   */
  const [activeKnot, setActiveKnot] = useState<string | null>(null)
  const [editorSelection, setEditorSelection] = useState("");
  /**
   * Bumped whenever the assistant writes to the workspace. Everything that
   * caches a file — the file tree, the plan, the project list — reloads off
   * this, because the writes happened in the main process and nothing in the
   * renderer would otherwise know they had.
   */
  const [workspaceNonce, setWorkspaceNonce] = useState(0);
  const assistant = useAssistant();
  // Bumped to ask the file tree and the picker to focus their creation inputs,
  // so the menu's New… commands land somewhere visible rather than silently
  // switching a tab.
  const [newFileNonce, setNewFileNonce] = useState(0);
  const [pickerWantsNew, setPickerWantsNew] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  // The manuscript can be read from any file in the project, independently of
  // whichever one is open in the editor.
  const [manuscriptEntry, setManuscriptEntry] = useState<string | null>(null);
  /**
   * Set when jumping to a source line; nonce forces repeats.
   *
   * `align` is where the line lands: the manuscript and the outline want it
   * centred with its context, a search hit wants it at the top to read forward.
   */
  const [gotoLine, setGotoLine] = useState<{
    line: number;
    nonce: number;
    align?: "center" | "start";
  } | null>(null);
  /** A knot to trace once the manuscript view has opened. */
  const [pendingTrace, setPendingTrace] = useState<string | null>(null);
  /**
   * Changing view carries the dock tab across when the new view has it. The
   * assistant is in every view, so choosing it once keeps it — which is the
   * whole of "available everywhere" from the author's side.
   */
  const showView = useCallback((next: ViewMode): void => {
    setViewMode(next);
    setRightTab((current) => tabFor(next, current));
  }, []);

  /** Go to the Game view, on the catalogue asked for. */
  const openManager = useCallback(
    (section: ManagerSection): void => {
      setManagerSection(section);
      showView("game");
    },
    [showView],
  );
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  const manuscript = useManuscript(
    viewMode === "manuscript" ? project : null,
    viewMode === "manuscript" ? manuscriptEntry : null,
    workspaceNonce,
  );

  // Also loaded for the editor's write panel, which lists what the plan will
  // contribute to the prompt. The main process reads the plan itself when it
  // actually builds one, so an unloaded plan here would show the author a
  // context narrower than the one being sent.
  const plan = usePlan(
    project,
    viewMode === "plan" ||
      // The map offers its knots grouped by act and chapter, which it cannot do
      // from a plan nobody loaded.
      viewMode === "game",
    workspaceNonce,
  );
  const [planMode, setPlanMode] = useState<PlanMode>("grid");
  const [planImportOpen, setPlanImportOpen] = useState(false);
  /** The plan section open in its expanded view. */
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const codex = useCodex(project, workspaceNonce);

  // Open the project's entry point as soon as the file list arrives.
  useEffect(() => {
    if (!project || openFile || files.length === 0) return;
    const main = files.find((file) => file.path === project.main) ?? files[0]!;
    void window.inkcrafter.readFile(main.absolutePath).then((contents) => {
      setOpenFile(main);
      setSource(contents);
      diskSource.current = contents;
      setDirty(false);
    });
  }, [project, files, openFile]);

  // Compilation is async and debounced, so a slow run can land after a newer
  // one. Only the newest request is allowed to write to state.
  const requestId = useRef(0);

  useEffect(() => {
    if (!openFile) {
      setResult(EMPTY_RESULT);
      return;
    }

    setCompiling(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      // Compile the whole story, not the open file alone. A chapter usually
      // diverts into the next one, so compiling it by itself reports every
      // hand-off as a missing target — which is what the author sees the moment
      // they click anything other than the entry point.
      const entry = files.find((file) => file.path === project?.main);
      const root = entry ?? openFile;
      const overrides = { [openFile.absolutePath]: source };

      void window.inkcrafter
        .compile({ filePath: root.absolutePath, overrides })
        .then(async (next) => {
          if (id !== requestId.current) return;

          // A file the entry point never includes was not part of that compile,
          // so its own problems would go unreported. Compile it on its own.
          if (!next.filesRead.includes(openFile.absolutePath)) {
            const alone = await window.inkcrafter.compile({
              filePath: openFile.absolutePath,
              source,
            });
            if (id !== requestId.current) return;
            setResult(alone);
            setCompiling(false);
            return;
          }

          setResult(next);
          setCompiling(false);
        });
    }, COMPILE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [source, openFile, files, project?.main]);

  // Detection scans the whole file, so let React keep typing responsive and
  // catch up on mentions when it has a spare moment.
  const deferredSource = useDeferredValue(source);
  // Stays the open file's: these are ranges into the document the editor is
  // showing, and they are what underlines a name in it.
  const mentions = useMemo(
    () => findMentions(deferredSource, codex.entries),
    [deferredSource, codex.entries],
  );

  /**
   * How often each entry is named across the whole story.
   *
   * Counted in main over every ink file rather than here over the open one: the
   * badge sits beside the entry and reads as a fact about the entry, so
   * counting only what happened to be on screen made a central character show 0
   * whenever the author was looking at a chapter she is not in.
   *
   * The open buffer goes along unsaved, so the number still moves as it is
   * typed rather than waiting for the next save.
   */
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (!project || codex.entries.length === 0) {
      setMentionCounts({});
      return;
    }

    let live = true;
    const timer = setTimeout(() => {
      void window.inkcrafter.codex
        .mentionCounts(project, {
          entries: codex.entries,
          ...(openFile
            ? { overrides: { [openFile.absolutePath]: deferredSource } }
            : {}),
        })
        .then((next) => {
          if (live) setMentionCounts(next);
        });
    }, MENTION_DEBOUNCE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, codex.entries, openFile, deferredSource, files]);


  /**
   * Writes the buffer, unless somebody else got there first.
   *
   * Disk is read rather than trusted to the watcher: `fs.watch` makes no
   * promise that every change produces an event, and this is the moment where
   * missing one costs the author their collaborator's work rather than a stale
   * view. A conflict already on screen blocks the save outright — the whole
   * point of asking is not to write until it is answered.
   */
  const save = useCallback(async () => {
    if (!openFile || conflictRef.current) return;

    const onDisk = await window.inkcrafter
      .readFile(openFile.absolutePath)
      // A file that has gone is not a conflict; the save puts it back.
      .catch(() => diskSource.current);

    if (onDisk !== diskSource.current) {
      setConflict({ path: openFile.path, theirs: onDisk });
      return;
    }

    await window.inkcrafter.saveFile(openFile.absolutePath, source);
    diskSource.current = source;
    setDirty(false);
  }, [openFile, source]);

  // Ctrl+S now comes from the File menu's accelerator. This keeps it working
  // when focus is somewhere the menu does not reach.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  /**
   * The manuscript compiles from disk, so an unsaved buffer would produce a
   * reading of a story that does not exist yet.
   */
  const showManuscript = useCallback(async () => {
    if (dirty) await save();
    setManuscriptEntry((current) => current ?? project?.main ?? null);
    showView("manuscript");
  }, [dirty, save, project]);

  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleMenuAction = useCallback(
    (action: MenuAction): void => {
      switch (action) {
        case "view:commands":
          // Toggle: a second Ctrl+K on an open palette should close it, not
          // silently do nothing.
          setPaletteOpen((open) => !open);
          break;
        case "settings:open":
          setSettingsOpen(true);
          break;
        case "assistant:open":
          setRightTab("assistant");
          break;
        case "file:save":
          // Save whichever document the view is showing.
          if (viewMode === "plan") void plan.flush();
          else void save();
          break;
        case "file:newFile":
          setSidebar("files");
          setNewFileNonce((nonce) => nonce + 1);
          break;
        case "file:newProject":
          setPickerWantsNew(true);
          session.close();
          break;
        case "file:openProject":
          setPickerWantsNew(false);
          session.close();
          break;
        case "file:closeProject":
          session.close();
          break;
        case "project:settings":
          setProjectOpen(true);
          break;
        case "project:libraries":
          setLibrariesOpen(true);
          break;
        case "project:stats":
          openManager("stats");
          break;
        case "project:media":
          openManager("media");
          break;
        case "project:export":
          setExportOpen(true);
          break;
        case "search:inFiles":
          setSearchOpen(true);
          break;
        case "player:preview":
          void previewInPlayer();
          break;
        case "project:cast":
          openManager("cast");
          break;
        case "project:map":
          openManager("map");
          break;
        case "view:editor":
          showView("editor");
          break;
        case "view:manuscript":
          void showManuscript();
          break;
        case "view:outline":
          showView("plan");
          break;
      }
    },
    [save, session, showManuscript, viewMode, plan],
  );

  // onMenuAction returns its own unsubscribe, which is what the effect wants.
  useEffect(
    () => window.inkcrafter.onMenuAction(handleMenuAction),
    [handleMenuAction],
  );

  // A section index outlives the manuscript it was taken from — leaving the
  // manuscript view empties the reading — so drop one that no longer addresses
  // anything rather than letting it point past the end.
  useEffect(() => {
    const count = sectionsOf(manuscript.manuscript).length;
    setSelectedSection((current) =>
      current === null || current < count ? current : null,
    );
  }, [manuscript.manuscript]);

  // Run a queued trace once the manuscript has finished opening, since the
  // session it searches does not exist until then.
  useEffect(() => {
    if (!pendingTrace || viewMode !== "manuscript" || manuscript.loading)
      return;
    setPendingTrace(null);
    void manuscript.traceTo(pendingTrace);
  }, [pendingTrace, viewMode, manuscript]);

  const selectFile = useCallback(
    async (file: ProjectFile) => {
      if (dirty) await save();
      const contents = await window.inkcrafter.readFile(file.absolutePath);
      setOpenFile(file);
      setSource(contents);
      diskSource.current = contents;
      setDirty(false);
      setConflict(null);
      // Returned rather than only stored: a caller that has to look inside the
      // file it just opened would otherwise read it a second time, and would
      // race the state it is waiting for.
      return contents;
    },
    [dirty, save],
  );

  /**
   * Re-reads the open file, because something other than the editor changed it.
   *
   * Deliberately not `selectFile`: that one saves the buffer first, which is
   * exactly wrong here — the buffer is the stale copy, and writing it would put
   * back the line the move just fixed.
   */
  const reopenFromDisk = useCallback(async (file: ProjectFile) => {
    const contents = await window.inkcrafter.readFile(file.absolutePath);
    setSource(contents);
    diskSource.current = contents;
    setDirty(false);
    setConflict(null);
  }, []);

  /**
   * Follow a knot header into the manuscript. The trace runs against the saved
   * file, so an unsaved buffer is written first — otherwise the path would be
   * found through a story that is not on disk.
   */
  const followKnot = useCallback(
    async (knot: string) => {
      await showManuscript();
      // The view has to be mounted with an entry before it can trace.
      setPendingTrace(knot);
    },
    [showManuscript],
  );

  /** Opens a project ink file in the editor, optionally at a line. */
  const openProjectFile = useCallback(
    (path: string, line?: number) => {
      const file = files.find((candidate) => candidate.path === path);
      if (!file) return;
      showView("editor");
      void selectFile(file).then(() => {
        if (line !== undefined) setGotoLine({ line, nonce: Date.now() });
      });
    },
    [files, selectFile],
  );

  /**
   * The project-relative name for a path ink reported absolutely.
   *
   * Diagnostics carry an absolute path and the file list is keyed on the
   * relative one, so a name shown here is also a name the row can open. A file
   * outside the project resolves to null rather than being shown as a path
   * nothing will act on.
   */
  const relativeDiagnosticPath = useCallback(
    (absolute: string | null): string | null =>
      absolute === null
        ? null
        : (files.find((file) => file.absolutePath === absolute)?.path ?? null),
    [files],
  );

  /** Jump from a line of the manuscript to the ink that produced it. */
  const openSource = useCallback(
    (anchor: SourceAnchor) => {
      const file = files.find((candidate) => candidate.path === anchor.file);
      if (!file) return;
      showView("editor");
      void selectFile(file).then(() =>
        setGotoLine({ line: anchor.line, nonce: Date.now() }),
      );
    },
    [files, selectFile],
  );

  /**
   * Jump from a search result to the line that matched.
   *
   * Differs from `openSource` in the two things a result asks for that the
   * manuscript does not: the rail comes back to the file tree, where the file
   * just landed in is the highlighted one, and the line goes to the top of the
   * editor rather than the middle, because from a search hit the author is
   * reading forward from it.
   */
  const openHit = useCallback(
    (path: string, line: number) => {
      const file = files.find((candidate) => candidate.path === path);
      if (!file) return;
      setSidebar("files");
      showView("editor");
      void selectFile(file).then(() =>
        setGotoLine({ line, nonce: Date.now(), align: "start" }),
      );
    },
    [files, selectFile, showView],
  );

  // Ctrl-clicking a name in the editor shows that entry in the sidebar, where
  // the codex already lives. It used to take a tab on the right as well, which
  // is what left the dock no room for the thing that belongs in every view.
  const openEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
    setSidebar("codex");
  }, []);

  /** Opens the editing dialog, which is available from either view. */
  const editEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
    setEditingEntryId(entryId);
  }, []);

  const createEntry = useCallback(
    (name: string, type: CodexType, libraryId: string) => {
      void codex.create(name, type, libraryId).then((entry) => {
        if (entry) openEntry(entry.id);
      });
    },
    [codex, openEntry],
  );

  const deleteEntry = useCallback(
    async (entry: CodexEntry): Promise<void> => {
      await codex.remove(entry);
      setSelectedEntryId((current) => (current === entry.id ? null : current));
    },
    [codex],
  );

  const updateProject = useCallback(
    (next: Project) => {
      session.update(next);
    },
    [session],
  );

  const toasts = useToasts();

  /**
   * Watch the open project, and act on what anything other than this app writes.
   *
   * The three answers are different because the stakes are. A catalogue is
   * saved continuously and holds no draft worth protecting, so it is reloaded
   * outright — `workspaceNonce` is the same lever the assistant's writes
   * already pull. An ink file with no unsaved edits is likewise just reloaded.
   * An ink file being edited is the only case with two versions of real work
   * in it, and that one is asked about rather than decided.
   */
  useEffect(() => {
    void window.inkcrafter.watch.project(project);
    return () => {
      void window.inkcrafter.watch.project(null);
    };
  }, [project?.id, project]);

  useEffect(() => {
    return window.inkcrafter.watch.onChange((change) => {
      const open = openFileRef.current;
      const touchesOpen = open ? change.ink.includes(open.path) : false;

      // Everything but the open buffer: the catalogues, the file list, the
      // plan, the manuscript. All of them read from disk on this nonce.
      if (change.catalogues.length > 0 || change.other.length > 0 || change.ink.length > 0) {
        setWorkspaceNonce((current) => current + 1);
      }
      if (!open || !touchesOpen) return;

      void window.inkcrafter
        .readFile(open.absolutePath)
        .then((theirs) => {
          // Ours, echoing back through the filesystem, or a change that turned
          // out to leave the bytes alone.
          if (theirs === diskSource.current) return;
          if (openFileRef.current?.path !== open.path) return;

          if (!dirtyRef.current) {
            setSource(theirs);
            diskSource.current = theirs;
            toasts.show({ tone: "info", title: `Reloaded ${open.path}` });
            return;
          }
          setConflict({ path: open.path, theirs });
        })
        // A file that has been deleted or renamed out from under the buffer
        // leaves the buffer alone: it is the only copy left.
        .catch(() => undefined);
    });
  }, [toasts]);

  /**
   * Ctrl-clicking a divert: open the knot it leads to.
   *
   * The open file first, because that is where most diverts land and it needs
   * no reload — and because an unsaved buffer holds knots that are not on disk
   * yet, which the project scan could not find. Only then the rest of the
   * project, scanned rather than compiled so this still works while the story
   * around it is half-written.
   */
  const goToKnot = useCallback(
    async (knot: string) => {
      const here = findKnot(source, knot);
      if (here) {
        showView("editor");
        setGotoLine({ line: here.line, nonce: Date.now(), align: "start" });
        return;
      }
      if (!project) return;

      const found = (await window.inkcrafter.map.destinations(project)).find(
        (one) => one.knot === knot,
      );
      const file = found && files.find((one) => one.path === found.file);
      if (!file) {
        toasts.show({
          tone: "error",
          title: `Nothing declares ${knot}`,
          detail: "No ink file in this project has a knot by that name.",
        });
        return;
      }

      showView("editor");
      const contents = await selectFile(file);
      const at = findKnot(contents, knot);
      if (at) setGotoLine({ line: at.line, nonce: Date.now(), align: "start" });
    },
    [source, project, files, selectFile, showView, toasts],
  );

  /**
   * What the manuscript refused, said once and dismissible.
   *
   * It used to be printed into the reading as a bare line between the header
   * and the hint, which is neither part of the manuscript nor something the
   * author could get rid of. Cleared as soon as it is shown, so that asking for
   * the same impossible thing twice reports it twice — the value alone does not
   * change, and an effect watching it would sit silent the second time.
   *
   * The message is a sentence and a reason; the sentence is the title and the
   * reason is the detail, which is the shape `wrote` already uses.
   */
  useEffect(() => {
    const said = manuscript.error;
    if (!said) return;

    const stop = said.indexOf(". ");
    toasts.show({
      tone: "error",
      title: stop === -1 ? said : said.slice(0, stop + 1),
      detail: stop === -1 ? undefined : said.slice(stop + 2),
    });
    manuscript.dismissError();
  }, [manuscript.error, manuscript.dismissError, toasts]);

  /**
   * Export into the connected player and make sure it is serving.
   *
   * The unsaved buffer lands first: the export compiles from disk, so previewing
   * what is on screen means writing it there before the compiler looks.
   *
   * Everything it can go wrong with is somebody else's folder — no player set,
   * the wrong one, one that was never installed, a story that does not compile —
   * so every ending here is a sentence rather than a silence.
   */
  const previewInPlayer = useCallback(async () => {
    if (!project) return;
    try {
      if (dirty) await save();

      toasts.show({ tone: "info", title: "Building the preview…" });
      const result = await window.inkcrafter.player.preview(project, activeKnot);

      if (!result.ok) {
        toasts.show({
          tone: "error",
          title: "Could not preview in the player",
          detail: result.problem ?? undefined
        });
        // The settings tab is where the folder is set and where the server's
        // output is, which is the next thing to look at either way.
        if (result.outDir === null) setSettingsOpen(true);
        return;
      }

      await window.inkcrafter.player.open(result.previewId);
      toasts.show({
        tone: "ok",
        title: "Previewing in the player",
        detail: result.url ?? undefined
      });
    } catch (error) {
      toasts.show({
        tone: "error",
        title: "Could not preview in the player",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }, [project, activeKnot, dirty, save, toasts]);

  /** Reloads whatever the assistant just wrote to. */
  const workspaceChanged = (paths: string[]): void => {
    if (paths.length === 0) return;
    setWorkspaceNonce((nonce) => nonce + 1);
    void session.refreshFiles();
  };

  /**
   * Keeps the editor buffer in step with a file regenerated outside the editor.
   *
   * Catalogue saves use project-relative paths while assistant tools may use a
   * workspace-relative one, so keep that distinction inside
   * `wroteOpenProjectFile`. A dirty buffer is never replaced silently.
   */
  const reloadOpenFileAfterWrite = (paths: string[]): void => {
    const currentProject = projectRef.current;
    const currentFile = openFileRef.current;
    if (
      currentProject === null ||
      currentFile === null ||
      !wroteOpenProjectFile(paths, currentProject.path, currentFile.path)
    ) {
      return;
    }

    if (dirtyRef.current) {
      toasts.show({
        tone: "error",
        title: `${currentFile.path} changed on disk`,
        detail:
          "The editor also has unsaved changes, so it was not reloaded. Copy that buffer before saving; saving it would replace the newer version on disk."
      });
      return;
    }

    void reopenFromDisk(currentFile).catch((error: unknown) =>
      toasts.show({
        tone: "error",
        title: `Could not reload ${currentFile.path}`,
        detail: error instanceof Error ? error.message : String(error)
      })
    );
  };

  /**
   * Re-reads the project folder, for changes made outside the app.
   *
   * The tree is a snapshot taken when the project opened, and nothing tells it
   * that an editor, a script or a checkout has added, removed or rewritten a
   * file — so until this runs, those files are simply not there. The open
   * buffer is brought forward on the same terms as any other outside write: a
   * dirty buffer is reported, never replaced.
   *
   * No toast on success. The tree and the editor are what changed, and both are
   * on screen.
   */
  const refreshFromDisk = (): void => {
    void session.refreshFiles();

    const currentFile = openFileRef.current;
    if (currentFile === null) return;

    if (dirtyRef.current) {
      toasts.show({
        tone: "error",
        title: `${currentFile.path} was not reloaded`,
        detail:
          "The editor has unsaved changes. Save or discard them, then refresh again to take the version on disk."
      });
      return;
    }

    void reopenFromDisk(currentFile).catch((error: unknown) =>
      toasts.show({
        tone: "error",
        title: `Could not reload ${currentFile.path}`,
        detail: error instanceof Error ? error.message : String(error)
      })
    );
  };

  /**
   * A catalogue regenerating `ink/state.ink` is the case toasts exist for: the
   * file is written, the story changes, and nothing on screen says so.
   */
  const catalogueWrote = (paths: string[]): void => {
    workspaceChanged(paths);
    reloadOpenFileAfterWrite(paths);
    toasts.wrote(paths);
  };

  // Saving the catalogue rewrites ink/state.ink and may add an INCLUDE to the
  // entry point, so it reports what it touched through the same path the
  // assistant's writes take.
  const stats = useStats(
    project,
    STAGED_VIEWS.has(viewMode),
    workspaceNonce,
    catalogueWrote,
  );
  // Also loaded for the editor, where the preview needs it to draw the scene.
  const media = useMedia(
    project,
    STAGED_VIEWS.has(viewMode),
    workspaceNonce,
  );

  /**
   * A catalogued file as something the renderer can show.
   *
   * The catalogue holds paths relative to `media/`; the window can only load an
   * `app://` URL, and only the scan knows which is which. With no look named it
   * takes the first, which is what a bare tag does.
   */
  const mediaUrlOf = useCallback(
    (kind: string, name: string, look: string | null): string | null => {
      if (name.length === 0) return null
      const asset = media.doc.assets.find(
        (one) => one.kind === kind && one.name === name,
      );
      const variant = look === null
        ? asset?.variants[0]
        : asset?.variants.find((one) => one.name === look);
      if (!variant) return null;
      return media.files.find((file) => file.path === variant.file)?.url ?? null;
    },
    [media.doc, media.files],
  );

  // The cast shares ink/state.ink with the stats, so a save here moves the same
  // generated file and has to report it the same way. Loaded for the editor too:
  // a cast attribute is a stat like any other to the right-click menu, and the
  // preview needs the ranges to clamp a `# npc:` tag the way the game will.
  const npcs = useNpcs(
    project,
    STAGED_VIEWS.has(viewMode),
    workspaceNonce,
    catalogueWrote,
  );
  // The map gates on stats and cast, so it needs both catalogues loaded to
  // offer them — a gate that can only name things that exist is the point.
  const map = useMap(project, viewMode === "game", workspaceNonce);
  const gallery = useGallery(project, viewMode === "game", workspaceNonce);
  const achievements = useAchievements(project, viewMode === "game", workspaceNonce);
  const game = useGame(project, viewMode === "game", workspaceNonce);
  // The editor's # completion offers minigame names, so keep this catalogue
  // loaded anywhere tags are authored, not only on its own Game tab.
  const minigames = useMinigames(project, STAGED_VIEWS.has(viewMode), workspaceNonce);
  // What the `#` menu in the editor may offer. Memoised because it is pushed
  // into CodeMirror by an effect, and a fresh object each render would dispatch
  // a transaction on every keystroke.
  const tagCatalogues = useMemo(
    () => ({ media: media.doc, stats: stats.doc, npcs: npcs.doc, minigames: minigames.doc }),
    [media.doc, stats.doc, npcs.doc, minigames.doc],
  );

  // What the author is looking at, sent with every turn. The assistant sits
  // beside the work now, so "add a choice here" is the ordinary request and it
  // means nothing without this.
  const assistantContext: ChatContext = {
    view: viewMode,
    ...(viewMode === "editor" && openFile ? { file: openFile.path } : {}),
    ...(viewMode === "editor" && editorSelection.trim().length > 0
      ? { selection: editorSelection.slice(0, MAX_SELECTION_CHARS) }
      : {}),
    ...(viewMode === "manuscript" && selectedSection !== null
      ? { section: String(selectedSection + 1) }
      : {}),
    ...(viewMode === "game" ? { catalogue: managerSection } : {}),
  };

  const assistantPanel = (
    <AssistantPanel
      assistant={assistant}
      projectPath={project?.path ?? null}
      projectTitle={project?.title ?? null}
      context={assistantContext}
      codexEntries={codex.entries}
      contextText={viewMode === "editor" ? source : ""}
      takeFocus={project !== null && rightTab === "assistant"}
      onBeforeSend={async () => {
        if (dirtyRef.current) await save();
      }}
      onFilesWritten={(paths) => {
        workspaceChanged(paths);
        reloadOpenFileAfterWrite(paths);
        // The transcript already lists every file it touched, and a toast
        // repeating that is noise pretending to be accountability.
        if (rightTab !== "assistant") toasts.wrote(paths);
      }}
    />
  );

  // Leaving the view flushes whatever was edited. Each hook no-ops if nothing
  // changed, so this costs nothing on the way past.
  const flushCatalogues = useCallback((): void => {
    void media.flush();
    void stats.flush();
    void npcs.flush();
    void map.flush();
    void gallery.flush();
    void achievements.flush();
    void minigames.flush();
  }, [media, stats, npcs, map, gallery, achievements, minigames]);

  useEffect(() => {
    if (viewMode !== "game") flushCatalogues();
  }, [viewMode, flushCatalogues]);

  const gameView = project ? (
    <GameManagerView
      project={project}
      plan={plan.plan}
      section={managerSection}
      onSection={setManagerSection}
      media={{
        doc: media.doc,
        files: media.files,
        saving: media.saving,
        error: media.error,
        onChange: media.apply,
        onRescan: () => void media.rescan(),
        onReveal: () => void window.inkcrafter.media.reveal(project),
        onOpenUse: openProjectFile,
      }}
      stats={{
        doc: stats.doc,
        saving: stats.saving,
        error: stats.error,
        findUses: (name) => window.inkcrafter.stats.uses(project, name),
        onChange: stats.apply,
        onOpenUse: (use) => {
          openProjectFile(use.path, use.line);
        },
      }}
      cast={{
        doc: npcs.doc,
        saving: npcs.saving,
        error: npcs.error,
        onChange: npcs.apply,
      }}
      map={{
        doc: map.doc,
        saving: map.saving,
        error: map.error,
        knots: map.knots,
        knotSources: map.knotSources,
        backgrounds: media.doc.assets
          .filter((asset) => asset.kind === "background")
          .map((asset) => asset.name),
        // A function rather than a URL: which picture depends on which map
        // is being edited, and that lives inside the panel.
        backgroundUrl: (name: string) => mediaUrlOf("background", name, null),
        hotspots: media.doc.assets
          .filter((asset) => asset.kind === "hotspot")
          .map((asset) => asset.name),
        // A state with no art of its own falls back to idle, which is what a
        // player does: three states are a refinement, and one is the picture.
        hotspotUrl: (name: string, state: string) =>
          mediaUrlOf("hotspot", name, state) ?? mediaUrlOf("hotspot", name, "idle"),
        onChange: map.apply,
      }}
      gallery={{
        doc: gallery.doc,
        saving: gallery.saving,
        error: gallery.error,
        onChange: gallery.apply,
      }}
      achievements={{
        doc: achievements.doc,
        saving: achievements.saving,
        error: achievements.error,
        onChange: achievements.apply,
      }}
      game={{
        doc: game.doc,
        saving: game.saving,
        error: game.error,
        onChange: game.apply,
      }}
      minigames={{
        doc: minigames.doc,
        saving: minigames.saving,
        error: minigames.error,
        onChange: minigames.apply,
        onTest: async (name) => {
          await Promise.all([minigames.flush(), media.flush(), stats.flush()]);
          toasts.show({ tone: "info", title: `Building ${name}…` });
          const result = await window.inkcrafter.player.preview(project, null);
          if (!result.ok) {
            toasts.show({
              tone: "error",
              title: "Could not test the minigame",
              detail: result.problem ?? undefined,
            });
            if (result.outDir === null) setSettingsOpen(true);
            return;
          }
          await window.inkcrafter.player.open(result.previewId, name);
          toasts.show({ tone: "ok", title: `Testing ${name} in the player` });
        },
      }}
    />
  ) : null;

  const searchOverlay =
    searchOpen && project ? (
      <SearchDialog
        project={project}
        onOpen={openHit}
        onClose={() => setSearchOpen(false)}
      />
    ) : null;

  const exportOverlay =
    exportOpen && project ? (
      <ExportDialog
        project={project}
        onRemember={(destination) => {
          void window.inkcrafter.projects.save({ ...project, bundleOut: destination });
        }}
        onRememberDesktop={(desktop) => {
          void window.inkcrafter.projects.save({ ...project, desktop });
        }}
        onClose={() => setExportOpen(false)}
      />
    ) : null;

  const settingsOverlay = settingsOpen ? (
    <SettingsDialog onClose={() => setSettingsOpen(false)} />
  ) : null;

  // Runs the command through the same switch the menu bar does, rather than
  // holding a second implementation of every command that would have to be kept
  // in step with the first.
  const commandPalette = paletteOpen ? (
    <CommandPalette
      platform={window.inkcrafter.platform}
      onClose={() => setPaletteOpen(false)}
      onRun={(command) => {
        setPaletteOpen(false);
        handleMenuAction(command.action);
      }}
    />
  ) : null;

  // Both are reachable from the menu at all times, including before a project is
  // open — creating one is a thing to ask the assistant for — so they render on
  // the picker too. The picker is keyed on the nonce so that a project written
  // by the assistant appears in the list without a restart.
  if (!project) {
    return (
      <>
        <ProjectPicker
          key={workspaceNonce}
          onOpen={session.open}
          autoFocusNew={pickerWantsNew}
        />
        <aside className="picker-assistant">{assistantPanel}</aside>
        {settingsOverlay}
        {commandPalette}
      </>
    );
  }

  const editingEntry =
    codex.entries.find((entry) => entry.id === editingEntryId) ?? null;
  const linkedLibraries = codex.libraries.filter((library) =>
    project.libraries.includes(library.id),
  );

  // The expanded section, with how deep it sits so the dialog can name it an
  // act, a chapter or a Scene. Every Scene owns one app-managed Ink file.
  const expandedNode = ((): {
    node: PlanNode;
    depth: number;
    ancestors: PlanNode[];
  } | null => {
    if (!expandedNodeId) return null;
    type Found = { node: PlanNode; depth: number; ancestors: PlanNode[] };
    const find = (
      nodes: PlanNode[],
      depth: number,
      ancestors: PlanNode[],
    ): Found | null => {
      for (const node of nodes) {
        if (node.id === expandedNodeId) return { node, depth, ancestors };
        const found = find(node.children, depth + 1, [...ancestors, node]);
        if (found) return found;
      }
      return null;
    };
    return find(plan.plan.nodes, 0, []);
  })();

  const libraryTitleOf = (libraryId: string): string =>
    codex.libraries.find((library) => library.id === libraryId)?.title ??
    "Unknown library";

  const errorCount = result.diagnostics.filter(
    (d) => d.severity === "error",
  ).length;
  const warningCount = result.diagnostics.filter(
    (d) => d.severity === "warning",
  ).length;

  return (
    <div className="app">
      <Toolbar className="toolbar">
        {/* Exactly the sidebar's width plus its splitter, so the tabs below
            begin where the editor column does. */}
        <ToolbarBrand
          className="brand"
          style={{ width: sidebarWidth + SPLITTER_WIDTH }}
        >
          <Icon name="feather" size={15} style={{ color: "var(--text-accent)" }} />
          {project.title}
        </ToolbarBrand>
        {/* Four places to be. The Game Manager was a button here until it
            needed a right panel beside it, which only a view has. */}
        <Tabs
          className="view-tabs"
          label="View"
          value={viewMode}
          onChange={(next) =>
            next === "manuscript"
              ? void showManuscript()
              : showView(next as ViewMode)
          }
          items={(["editor", "manuscript", "plan", "game"] as const).map(
            (candidate, index) => ({
              value: candidate,
              label: VIEW_LABELS[candidate],
              hint: `Ctrl+${index + 1}`,
            }),
          )}
        />
        <ToolbarFile className="file-name">
          <Icon name="file-text" size={12} />
          {viewMode === "plan"
            ? "plan.json"
            : viewMode === "game"
              ? SECTION_FILES[managerSection]
              : viewMode === "manuscript"
                ? (manuscriptEntry ?? project.main)
                : (openFile?.path ?? "No file open")}
          {dirty && viewMode === "editor" && (
            <span className="dirty-dot" title="Unsaved changes" />
          )}
          {viewMode === "plan" && plan.saving && (
            <span className="dirty-dot" title="Saving" />
          )}
        </ToolbarFile>
        <ToolbarSpacer />

        {/* The toolbar's whole allowance is two quiet icon buttons. These are
            they: everything else in the app is a keystroke away in the palette,
            which is what lets this bar stay this short. */}
        <IconButton
          icon="search"
          label="Commands (Ctrl+K)"
          size="sm"
          onClick={() => setPaletteOpen(true)}
        />
        <IconButton
          icon="settings"
          label="Settings"
          size="sm"
          onClick={() => setSettingsOpen(true)}
        />

        {/* One pill per window, and only when there is something for it to
            report — with no file open it said nothing, which is what nothing
            looks like.

            A story that compiled says so with its colour and nothing else. How
            many milliseconds it took is a fact about the compiler, not about
            the story, and it changed on every keystroke in the corner of the
            eye. Words are kept for the cases that need an author to act. */}
        {openFile && (
          <StatusPill
            className="status"
            state={
              compiling
                ? "busy"
                : errorCount > 0
                  ? "error"
                  : warningCount > 0
                    ? "warn"
                    : "ok"
            }
            // The clean state is a colour and nothing else, so it needs saying
            // some other way: a dot on its own is mute to a screen reader and
            // means nothing to anyone who has not learnt it.
            title={compiling || errorCount > 0 || warningCount > 0 ? undefined : "Compiled"}
            aria-label={
              compiling || errorCount > 0 || warningCount > 0 ? undefined : "Compiled"
            }
          >
            {compiling
              ? "Compiling…"
              : errorCount > 0
                ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
                : warningCount > 0
                  ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
                  : ""}
          </StatusPill>
        )}
      </Toolbar>

      <main
        className={`workspace ${viewMode === "manuscript" ? "is-manuscript" : ""}`}
        style={{
          gridTemplateColumns: `${sidebarWidth}px auto minmax(0, 1fr) auto ${sideWidth}px`,
        }}
      >
        <aside className="codex">
          <Tabs
            level="pane"
            label="Sidebar"
            value={sidebar}
            onChange={(next) => {
              const selected = next as "files" | "codex";
              setSidebar(selected);
              // Opening the codex is also an explicit refresh point for files
              // written outside its own editor, including assistant tools.
              if (selected === "codex") void codex.reload();
            }}
            items={[
              { value: "files", label: "Files" },
              { value: "codex", label: "Codex" },
            ]}
          />

          {sidebar === "files" ? (
            <FileTree
              project={project}
              files={files}
              folders={session.folders}
              activePath={openFile?.path ?? null}
              onSelect={(file) => void selectFile(file)}
              onOpen={(file) => openProjectFile(file.path)}
              onAdd={(path) => {
                void session.addFile(`${path}`).then((file) => {
                  if (file) void selectFile(file);
                });
              }}
              onAddFolder={(path) => void session.addFolder(path)}
              onCopy={(from, toFolder) => {
                void session.copyFile(from, toFolder).then((landed) => {
                  if (landed) toasts.wrote([landed]);
                });
              }}
              // A rename rewrites the INCLUDEs that named the file, the entry
              // point and the plan, so it reports like a catalogue save: the
              // story changed and nothing on screen would otherwise say so.
              onMove={(from, to) => {
                void session.moveFile(from, to).then((result) => {
                  if (!result) return;
                  workspaceChanged([result.path, ...result.written]);

                  // The move rewrote the INCLUDE lines in other files. If one
                  // of them is the file on screen, the buffer is now older than
                  // the disk — and saving it would put the broken line back.
                  if (openFile && result.written.includes(openFile.path)) {
                    void reopenFromDisk(openFile);
                  }
                  if (openFile?.path === from) openProjectFile(result.path);

                  toasts.wrote([result.path, ...result.written]);
                });
              }}
              onReferences={(path) => session.referencesTo(path)}
              onDelete={(path) => {
                void session.deletePath(path).then((gone) => {
                  if (!gone) return;
                  workspaceChanged([path]);
                  // Whatever was showing has gone from disk; the editor must
                  // not keep offering to save it back.
                  if (openFile?.path === path || openFile?.path.startsWith(`${path}/`)) {
                    setOpenFile(null);
                  }
                });
              }}
              onSettings={() => setProjectOpen(true)}
              onReveal={() => void window.inkcrafter.projects.reveal(project)}
              onRefresh={refreshFromDisk}
              focusNewFile={newFileNonce}
            />
          ) : (
            <CodexPanel
              entries={codex.entries}
              linkedLibraries={linkedLibraries}
              conflicts={codex.conflicts}
              mentionCounts={mentionCounts}
              selectedId={selectedEntryId}
              loading={codex.loading}
              error={codex.error ?? session.error}
              onSelect={openEntry}
              onEdit={editEntry}
              onCreate={createEntry}
              onOpenSettings={() => setLibrariesOpen(true)}
            />
          )}
        </aside>

        <Splitter
          value={sidebarWidth}
          onChange={setSidebarWidth}
          onCommit={commitSidebarWidth}
          min={SIDEBAR_MIN}
          max={SIDEBAR_MAX}
          reset={SIDEBAR_DEFAULT}
          label="Resize the sidebar"
        />

        {/* The stack is absolute against this pane, so it can never reach the
            dock's composer or the diagnostics strip below. */}
        <section className="pane pane-editor">
          <ToastStack>
            {toasts.entries.map((toast) => (
              <Toast
                key={toast.id}
                tone={toast.tone}
                title={toast.title}
                detail={toast.detail}
                onDismiss={() => toasts.dismiss(toast.id)}
              />
            ))}
          </ToastStack>
          {viewMode === "game" ? (
            gameView
          ) : viewMode === "plan" ? (
            <>
              {/* Here rather than in the right panel: it has always switched
                  this pane, and a tab that changes a different column is a
                  small lie about what tabs do. */}
              <Tabs
                level="pane"
                label="Plan view"
                value={planMode}
                onChange={(next) => setPlanMode(next as PlanMode)}
                items={[
                  { value: "grid", label: "Grid" },
                  { value: "matrix", label: "Matrix" },
                  { value: "outline", label: "Outline" },
                ]}
              />
              {planMode === "matrix" ? (
                <PlanMatrix
                  plan={plan.plan}
                  entries={codex.entries}
                  onOpenEntry={editEntry}
                />
              ) : planMode === "outline" ? (
                <PlanOutline
                  plan={plan.plan}
                  onChange={plan.apply}
                  onOpenFile={openProjectFile}
                  onExpand={setExpandedNodeId}
                  onImport={() => setPlanImportOpen(true)}
                />
              ) : (
                <PlanGrid
                  plan={plan.plan}
                  entries={codex.entries}
                  onChange={plan.apply}
                  onCreateScene={(chapterId, title) => {
                    void window.inkcrafter.plan
                      .createScene(project, plan.plan, chapterId, title)
                      .then((result) => {
                        plan.adopt(result.plan)
                        workspaceChanged(result.written)
                        toasts.wrote(result.written)
                      })
                      .catch((error: unknown) =>
                        toasts.show({
                          tone: "error",
                          title: "Could not create the Scene",
                          detail: error instanceof Error ? error.message : String(error),
                        }),
                      )
                  }}
                  onOpenEntry={editEntry}
                  onOpenFile={openProjectFile}
                  onExpand={setExpandedNodeId}
                  onImport={() => setPlanImportOpen(true)}
                />
              )}
            </>
          ) : viewMode === "manuscript" ? (
            <ManuscriptView
              session={manuscript}
              entryLabel={manuscriptEntry ?? project.main}
              codexEntries={codex.entries}
              onOpenSource={openSource}
              onOpenEntry={openEntry}
              selectedSection={selectedSection}
              onSelectSection={(index) => {
                setSelectedSection(index);
                setRightTab("assistant");
              }}
              media={media.doc}
              mediaFiles={media.files}
            />
          ) : openFile ? (
            <InkEditor
              value={source}
              onChange={(next) => {
                setSource(next);
                setDirty(true);
              }}
              diagnostics={result.diagnostics}
              filePath={openFile.absolutePath}
              mentions={mentions}
              catalogues={tagCatalogues}
              onOpenEntry={openEntry}
              onFollowKnot={(knot) => void followKnot(knot)}
              onGoToKnot={(knot) => void goToKnot(knot)}
              gotoLine={gotoLine}
              edit={inkEdit}
              onEditHandled={(nonce) =>
                setInkEdit((current) =>
                  current?.nonce === nonce ? null : current,
                )
              }
              onSelectionChange={setEditorSelection}
              onKnotChange={setActiveKnot}
              onContextMenu={setMenuTarget}
            />
          ) : (
            <Hint className="pad">Add an ink file to get started.</Hint>
          )}
        </section>

        <Splitter
          value={sideWidth}
          onChange={setSideWidth}
          onCommit={commitSideWidth}
          min={SIDE_MIN}
          max={SIDE_MAX}
          invert
          reset={SIDE_DEFAULT}
          label="Resize the right panel"
        />

        {/* The dock. One tab strip, the same in every view, so a control
            that opens a tab cannot be dead anywhere — which is what let the
            assistant stop being a dialog over the thing it was asked about. */}
        <section className="pane pane-side">
          <Tabs
            level="pane"
            label="Right panel"
            value={rightTab}
            onChange={(next) => setRightTab(next as RightTab)}
            items={RIGHT_TABS[viewMode].map((tab) => ({
              value: tab,
              label: tabLabel(viewMode, tab),
            }))}
          />

          {/* One slot, and the view decides which of the two it holds: the
              manuscript is the only place with something to write into. */}
          {rightTab === "assistant" &&
            (isWriteView(viewMode) ? (
              <WritePanel
                manuscript={manuscript.manuscript}
                session={manuscript}
                sectionIndex={selectedSection}
                codexEntries={codex.entries}
              />
            ) : (
              assistantPanel
            ))}

          {rightTab === "preview" && (
            <StoryPlayer
              storyJson={result.storyJson}
              knot={activeKnot}
              media={media.doc}
              mediaFiles={media.files}
              stats={stats.doc}
              npcs={npcs.doc}
            />
          )}

          {rightTab === "reading" && (
            <ManuscriptOutline
              manuscript={manuscript.manuscript}
              files={files}
              entryPath={manuscriptEntry ?? project.main}
              onChangeEntry={setManuscriptEntry}
              onReload={() => void manuscript.reload()}
            />
          )}

          {rightTab === "debug" && (
            <DebugPanel
              project={project}
              onBeforeRun={async () => {
                if (dirtyRef.current) await save();
              }}
              onOpen={openProjectFile}
            />
          )}

          {rightTab === "structure" && (
            <PlanStructure
              plan={plan.plan}
              projectFiles={files.map((file) => file.path)}
              onChange={plan.apply}
              onOpenFile={openProjectFile}
              onImport={() => setPlanImportOpen(true)}
            />
          )}
        </section>
      </main>

      {/* Every row goes to its line. A diagnostic you cannot navigate to is a
          dead end, and the compiler quoting a line number you then have to find
          by hand is the version of that this app shipped. */}
      <Diagnostics
        emptyLabel=""
        items={result.diagnostics.map((diagnostic) => ({
          severity: diagnostic.severity,
          message: diagnostic.message,
          line: diagnostic.line,
          // ink reports an absolute path; the file list is keyed on the
          // project-relative one, so only show a name we can also open.
          file: relativeDiagnosticPath(diagnostic.file)
        }))}
        onSelect={(item) => {
          if (item.line === null || item.line === undefined) return;
          const path = item.file ?? openFile?.path;
          if (path) openProjectFile(path, item.line);
        }}
      />

      {commandPalette}

      {editingEntry && (
        <CodexEntryDialog
          entry={editingEntry}
          entries={codex.entries}
          libraryTitle={libraryTitleOf(editingEntry.libraryId)}
          mentionCount={mentionCounts[editingEntry.id] ?? 0}
          onSave={codex.saveNow}
          onDelete={deleteEntry}
          onMove={(entry, toFile) => void codex.move(entry, toFile)}
          onClose={() => setEditingEntryId(null)}
        />
      )}

      {expandedNode && (
        <PlanNodeDialog
          node={expandedNode.node}
          depth={expandedNode.depth}
          entries={codex.entries}
          projectFiles={files}
          projectFolders={session.folders}
          onSave={(id, changes) =>
            plan.apply(updatePlanNode(plan.plan, id, changes))
          }
          onOpenFile={openProjectFile}
          onOpenEntry={editEntry}
          onClose={() => setExpandedNodeId(null)}
        />
      )}

      {conflict && (
        <ConflictDialog
          path={conflict.path}
          onKeepMine={() => {
            // Their version becomes the baseline without being loaded: the
            // author has seen it and chosen against it, and asking again on
            // every save would be nagging rather than warning.
            diskSource.current = conflict.theirs;
            setConflict(null);
          }}
          onUseTheirs={() => {
            setSource(conflict.theirs);
            diskSource.current = conflict.theirs;
            setDirty(false);
            setConflict(null);
          }}
        />
      )}

      {planImportOpen && (
        <PlanImportDialog
          hasExisting={plan.plan.nodes.length > 0}
          onImport={plan.apply}
          onClose={() => setPlanImportOpen(false)}
        />
      )}

      {projectOpen && (
        <ProjectDialog
          project={project}
          files={files}
          libraries={codex.libraries}
          onSave={updateProject}
          onManageLibraries={() => {
            // Swapped rather than stacked, so there is never a dialog behind a
            // dialog with two ways to dismiss it.
            setProjectOpen(false);
            setLibrariesOpen(true);
          }}
          onReveal={() => void window.inkcrafter.projects.reveal(project)}
          onClose={() => setProjectOpen(false)}
        />
      )}

      {librariesOpen && (
        <LibraryDialog
          project={project}
          libraries={codex.libraries}
          onToggle={(libraryId, linked) =>
            updateProject({
              ...project,
              libraries: linked
                ? [...project.libraries, libraryId]
                : project.libraries.filter((id) => id !== libraryId),
            })
          }
          onSaveLibrary={async (library) => {
            await window.inkcrafter.libraries.save(library);
            await codex.reload();
          }}
          onCreate={codex.createLibrary}
          onReveal={(id) => void window.inkcrafter.libraries.reveal(id)}
          onClose={() => setLibrariesOpen(false)}
        />
      )}

      {menuTarget && (
        <InkContextMenu
          target={menuTarget}
          source={source}
          context={editorContextAt(source, menuTarget.offset)}
          stats={stats.doc}
          npcs={npcs.doc}
          media={media.doc}
          onApply={(edit) =>
            setInkEdit({
              ...edit,
              nonce: Date.now(),
              source,
              filePath: openFile?.absolutePath ?? "",
            })
          }
          onClose={() => setMenuTarget(null)}
          onManage={(which) => {
            setMenuTarget(null);
            openManager(which);
          }}
        />
      )}

      {searchOverlay}
      {exportOverlay}
      {settingsOverlay}
    </div>
  );
}
