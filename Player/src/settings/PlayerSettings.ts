import { PlayerStorage } from "@/platform/Storage";

export type TextSize = "small" | "normal" | "large";
export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface PlayerPreferences {
  textSize: TextSize;
  textSpeed: TextSpeed;
  reducedMotion: boolean;
  highContrast: boolean;
}

type PreferenceKey = keyof PlayerPreferences;
type Listener = (settings: Readonly<PlayerPreferences>) => void;

const STORAGE_KEY = "inkcrafter-player:preferences:v1";
const DEFAULTS: PlayerPreferences = {
  textSize: "normal",
  textSpeed: "normal",
  reducedMotion: false,
  highContrast: false,
};

class PlayerSettingsStore {
  private current: PlayerPreferences = { ...DEFAULTS };
  private readonly listeners = new Set<Listener>();

  get values(): Readonly<PlayerPreferences> {
    return this.current;
  }

  get textScale(): number {
    return this.current.textSize === "small" ? 0.9 : this.current.textSize === "large" ? 1.2 : 1;
  }

  get typeDelay(): number {
    if (this.current.reducedMotion || this.current.textSpeed === "instant") return 0;
    if (this.current.textSpeed === "slow") return 34;
    if (this.current.textSpeed === "fast") return 9;
    return 18;
  }

  reload(): void {
    this.current = read();
    this.notify();
  }

  set<K extends PreferenceKey>(key: K, value: PlayerPreferences[K]): void {
    if (this.current[key] === value) return;
    this.current = { ...this.current, [key]: value };
    try {
      PlayerStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch (error) {
      console.error("Could not save player settings.", error);
    }
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}

export const PlayerSettings = new PlayerSettingsStore();

function read(): PlayerPreferences {
  try {
    const parsed: unknown = JSON.parse(PlayerStorage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
    const data = parsed as Record<string, unknown>;
    return {
      textSize: data["textSize"] === "small" || data["textSize"] === "large" ? data["textSize"] : "normal",
      textSpeed:
        data["textSpeed"] === "slow" || data["textSpeed"] === "fast" || data["textSpeed"] === "instant"
          ? data["textSpeed"]
          : "normal",
      reducedMotion: data["reducedMotion"] === true,
      highContrast: data["highContrast"] === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
