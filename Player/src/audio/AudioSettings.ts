import { PlayerStorage } from "@/platform/Storage";

export type AudioSetting = "master" | "music" | "sfx";

export interface AudioLevels {
  master: number;
  music: number;
  sfx: number;
}

const STORAGE_KEY = "inkcrafter-player:audio:v1";
const DEFAULT_LEVELS: AudioLevels = {
  master: 1,
  // Preserve the quieter music mix the player used before settings existed.
  music: 0.5,
  sfx: 1,
};

type AudioSettingsListener = (levels: Readonly<AudioLevels>) => void;

/**
 * Player-wide audio preferences.
 *
 * These are deliberately not namespaced to a game: they describe the reader's
 * device and listening preference, unlike saves and story state. Channel
 * values are combined with Master at the point where sound is played.
 */
class AudioSettingsStore {
  private current: AudioLevels = loadLevels();
  private readonly listeners = new Set<AudioSettingsListener>();

  get levels(): Readonly<AudioLevels> {
    return this.current;
  }

  get musicVolume(): number {
    return this.current.master * this.current.music;
  }

  /** Video audio today, and the shared channel for authored effects later. */
  get sfxVolume(): number {
    return this.current.master * this.current.sfx;
  }

  reload(): void {
    this.current = loadLevels();
    for (const listener of this.listeners) listener(this.current);
  }

  set(setting: AudioSetting, value: number): void {
    const next = normalise(value);
    if (this.current[setting] === next) return;

    this.current = { ...this.current, [setting]: next };
    saveLevels(this.current);
    for (const listener of this.listeners) listener(this.current);
  }

  subscribe(listener: AudioSettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const AudioSettings = new AudioSettingsStore();

function normalise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(1, value));
  // Five-percent steps make slider values stable and easy to read.
  return Math.round(clamped * 20) / 20;
}

function loadLevels(): AudioLevels {
  try {
    const raw = PlayerStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LEVELS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_LEVELS };
    const record = parsed as Record<string, unknown>;

    return {
      master: levelOr(record["master"], DEFAULT_LEVELS.master),
      music: levelOr(record["music"], DEFAULT_LEVELS.music),
      sfx: levelOr(record["sfx"], DEFAULT_LEVELS.sfx),
    };
  } catch {
    return { ...DEFAULT_LEVELS };
  }
}

function levelOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? normalise(value) : fallback;
}

function saveLevels(levels: AudioLevels): void {
  try {
    PlayerStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {
    // Storage can be unavailable in a private or restricted browser. The
    // setting still applies for the rest of this session.
  }
}
