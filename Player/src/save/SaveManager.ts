import { SAVE } from "@/config/gameConfig";
import type { GameState, SceneMeta } from "@/state/GameState";
import { PlayerStorage } from "@/platform/Storage";

/** A persisted save payload. `inkState` is ink's own serialised runtime state. */
export interface SaveData {
  version: number;
  timestamp: number;
  /** Human-readable label, e.g. the current speaker or a short preview. */
  label: string;
  inkState: string;
  sceneMeta: SceneMeta;
  /**
   * Which story this was a save *of* — the project id from the bundle manifest.
   *
   * Slots are namespaced by this id (see `use` below), so a save from another
   * game should not be reachable at all; it is still recorded, and still
   * checked on load, because a hand-edited key or a reused project id would
   * otherwise silently restore a position that does not exist.
   */
  bundleId: string;
  /**
   * The story's content hash when the save was made.
   *
   * ink state addresses knots and variables by name, so a save survives a story
   * being rebuilt and becomes nonsense against a story that was *rewritten* —
   * and neither changes `version`. This is the only way to tell.
   */
  contentHash: string;
}

/** Why a save could not be opened, or how far it can be trusted. */
export type SaveVerdict = "ok" | "stale" | "other-story" | "incompatible";

/** Lightweight info for listing slots without fully parsing every field. */
export interface SlotInfo {
  /** Storage id, such as `manual-2-7`, `quick-3`, or `auto-9`. */
  slot: string;
  /** One-based position displayed within its page. */
  index: number;
  page: SavePageId;
  /** Only numbered manual pages may be written from the full menu. */
  writable: boolean;
  exists: boolean;
  data: SaveData | null;
  /** Made against an older version of this story; loadable, but maybe not whole. */
  stale: boolean;
}

export type SavePageId = "auto" | "quick" | `manual-${number}`;

export function manualPageId(page: number): SavePageId {
  return `manual-${page}`;
}

export function savePages(): SavePageId[] {
  const pages: SavePageId[] = ["auto", "quick"];
  for (let page = 1; page <= SAVE.manualPages; page++) pages.push(manualPageId(page));
  return pages;
}

/**
 * The game whose slots these are.
 *
 * localStorage is keyed by origin and `game/` holds however many games are
 * exported into it, so unnamespaced slots would mean game2 overwriting game1's
 * playthrough on the same dev server. Keyed by the story's project id rather
 * than its folder name, because the folder is just where an export happened to
 * land — renaming or re-exporting it should not lose a save.
 */
let currentGame = "";
/** Preview tabs keep their slots for the tab's lifetime without touching a reader's saves. */
let volatileStorage: Map<string, string> | null = null;

function stored(key: string): string | null {
  return volatileStorage?.get(key) ?? (volatileStorage ? null : PlayerStorage.getItem(key));
}

function store(key: string, value: string): void {
  if (volatileStorage) volatileStorage.set(key, value);
  else PlayerStorage.setItem(key, value);
}

function discard(key: string): void {
  if (volatileStorage) volatileStorage.delete(key);
  else PlayerStorage.removeItem(key);
}

/**
 * Save/load over `localStorage`. Each slot is one JSON document keyed
 * `mc:save:<project id>:<slot>`. Because stats live as ink variables, ink's
 * serialised state captures both story progress and stats; we additionally
 * store `sceneMeta` so the visual frame (background, sprites, speaker) can be
 * rebuilt on load.
 */
export const SaveManager = {
  /**
   * Point the slots at one game. Called once from `main.ts` with the manifest
   * in hand, before Phaser starts and so before any scene can read a slot.
   */
  use(projectId: string, options: { volatile?: boolean } = {}): void {
    currentGame = projectId;
    volatileStorage = options.volatile ? new Map() : null;
  },

  key(slot: string): string {
    return currentGame ? `${SAVE.prefix}${currentGame}:${slot}` : `${SAVE.prefix}${slot}`;
  },

  save(slot: string, state: GameState, label: string): SaveData {
    const { manifest } = state.bundle;
    const data: SaveData = {
      version: SAVE.version,
      timestamp: Date.now(),
      label,
      inkState: state.engine.saveState(),
      sceneMeta: structuredClone(state.sceneMeta),
      bundleId: manifest.project.id,
      contentHash: manifest.contentHash,
    };
    const encoded = JSON.stringify(data);
    try {
      store(this.key(slot), encoded);
    } catch (error) {
      // A page of text-only saves is normally far below localStorage's quota,
      // but a very long-running Ink state can grow. Sacrifice the oldest
      // automatic checkpoint first; manual and quick saves are never silently
      // discarded to make room.
      const oldestAuto = oldest(this.listPage("auto", state));
      if (!oldestAuto || oldestAuto.slot === slot) throw error;
      this.remove(oldestAuto.slot);
      store(this.key(slot), encoded);
    }
    return data;
  },

  load(slot: string, state?: GameState): SaveData | null {
    const raw = stored(this.key(slot)) ?? legacyRaw(slot);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as SaveData;
      const verdict = this.verdict(data, state);

      // Stale is offered anyway: content changes constantly while a story is
      // being written, and most edits leave a save perfectly loadable. The two
      // that are refused are refused because there is nothing to load *into*.
      if (verdict === "incompatible" || verdict === "other-story") {
        console.warn(`Save slot "${slot}" cannot be opened (${verdict}).`);
        return null;
      }
      return data;
    } catch (err) {
      console.error(`Failed to parse save slot "${slot}":`, err);
      return null;
    }
  },

  /**
   * How far a save can be trusted against the story now loaded.
   *
   * Three different failures, deliberately not collapsed. A schema change means
   * the blob cannot be read at all; a different story means the position in it
   * is meaningless; a rewritten story means it will *probably* load, and that
   * probably is worth offering rather than throwing away someone's playthrough.
   */
  verdict(data: SaveData, state?: GameState): SaveVerdict {
    if (data.version !== SAVE.version) return "incompatible";
    if (!state) return "ok";

    const { manifest } = state.bundle;
    if (data.bundleId !== manifest.project.id) return "other-story";
    return data.contentHash === manifest.contentHash ? "ok" : "stale";
  },

  /**
   * Apply a loaded save onto a GameState. Caller refreshes the scene after.
   *
   * Returns false rather than throwing when the state will not restore — a save
   * made before a knot was renamed is the ordinary case here, and it must not
   * take the game down with it.
   */
  apply(state: GameState, data: SaveData): boolean {
    try {
      state.engine.loadState(data.inkState);
    } catch (err) {
      console.error("This save was made against an older version of the story.", err);
      return false;
    }
    state.sceneMeta = structuredClone(data.sceneMeta);
    // ink state already carries player stats and all NPC variables; just
    // re-notify the HUD/panel listeners that the underlying values changed.
    state.refresh();
    return true;
  },

  exists(slot: string): boolean {
    return stored(this.key(slot)) !== null;
  },

  remove(slot: string): void {
    discard(this.key(slot));
    const legacy = legacySlot(slot);
    if (legacy) discard(this.key(legacy));
  },

  /** The ten fixed positions on one Auto, Quick, or numbered page. */
  listPage(page: SavePageId, state?: GameState): SlotInfo[] {
    const count =
      page === "auto"
        ? SAVE.autosaveSlots
        : page === "quick"
          ? SAVE.quickSlots
          : SAVE.slotsPerPage;
    return Array.from({ length: count }, (_, at) => {
      const index = at + 1;
      const slot = slotId(page, index);
      const data = this.load(slot, state);
      return {
        slot,
        index,
        page,
        writable: page.startsWith("manual-"),
        exists: data !== null,
        data,
        stale: data !== null && this.verdict(data, state) === "stale",
      };
    });
  },

  /** The next Quick Save position: empty first, then the oldest. */
  quickSave(state: GameState, label: string): SaveData {
    return this.save(rotatingTarget(this.listPage("quick", state)), state, label);
  },

  loadLatestQuick(state?: GameState): SaveData | null {
    return newest(this.listPage("quick", state))?.data ?? null;
  },

  autosave(state: GameState, label: string): SaveData {
    return this.save(rotatingTarget(this.listPage("auto", state)), state, label);
  },

  loadAutosave(state?: GameState): SaveData | null {
    return newest(this.listPage("auto", state))?.data ?? null;
  },

  /** Newest valid save of any kind, which is what Continue means. */
  loadLatest(state?: GameState): SaveData | null {
    const all = savePages().flatMap((page) => this.listPage(page, state));
    return newest(all)?.data ?? null;
  },

  hasAnySave(state?: GameState): boolean {
    return this.loadLatest(state) !== null;
  },
};

function slotId(page: SavePageId, index: number): string {
  return `${page}-${index}`;
}

/** Old singular/numbered keys remain readable in their matching first slots. */
function legacySlot(slot: string): string | null {
  if (slot === "quick-1") return "quick";
  if (slot === "auto-1") return "auto";

  const manual = /^manual-1-([1-4])$/.exec(slot);
  return manual?.[1] ?? null;
}

function legacyRaw(slot: string): string | null {
  const legacy = legacySlot(slot);
  return legacy ? stored(SaveManager.key(legacy)) : null;
}

function newest(slots: readonly SlotInfo[]): SlotInfo | null {
  let answer: SlotInfo | null = null;
  for (const slot of slots) {
    if (!slot.data) continue;
    if (!answer?.data || slot.data.timestamp > answer.data.timestamp) answer = slot;
  }
  return answer;
}

function oldest(slots: readonly SlotInfo[]): SlotInfo | null {
  let answer: SlotInfo | null = null;
  for (const slot of slots) {
    if (!slot.data) continue;
    if (!answer?.data || slot.data.timestamp < answer.data.timestamp) answer = slot;
  }
  return answer;
}

function rotatingTarget(slots: readonly SlotInfo[]): string {
  return slots.find((slot) => slot.data === null)?.slot ?? oldest(slots)?.slot ?? slots[0]!.slot;
}
