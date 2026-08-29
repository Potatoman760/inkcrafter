import type { StoryEngine } from "@/narrative/StoryEngine";
import type { CatalogueExport } from "@/bundle/spec/bundle/catalogue";

/** Declarative definition of a displayable stat. */
export interface StatDef {
  /** Variable name — matches a `VAR` the bundle's story declares. */
  key: string;
  /** Human label for the HUD. */
  label: string;
  /** Clamps applied to every change, or null for unbounded. */
  min: number | null;
  max: number | null;
  /** Hidden vars participate in changes and clamps but never in player UI snapshots. */
  visible: boolean;
}

/**
 * The stats to show, from the bundle's catalogue.
 *
 * Only whole-number stats: a HUD bar needs something to fill, and a flag or a
 * piece of text has no length. The ink variables remain the single source of
 * truth for the *values*, which is what makes save and load free — this only
 * says which of them a player should be shown, and how far they go.
 *
 * The clamps live here and nowhere else. Ink cannot express a range, so a stat
 * that should stop at 10 stops at 10 only because the game says so.
 */
export function statDefsFrom(catalogue: CatalogueExport): StatDef[] {
  return [
    ...catalogue.stats
      .filter((stat) => stat.type === "int")
      .map((stat) => ({
        key: stat.name,
        label: stat.display.length > 0 ? stat.display : stat.name,
        min: stat.min,
        max: stat.max,
        visible: true,
      })),
    ...catalogue.variables
      .filter((variable) => variable.type === "int")
      .map((variable) => ({
        key: variable.name,
        label: variable.name,
        min: variable.min,
        max: variable.max,
        visible: false,
      })),
  ];
}

export interface StatSnapshot {
  key: string;
  label: string;
  value: number;
  min: number | null;
  max: number | null;
}

/**
 * Typed facade over the story's variables for the declared stats.
 *
 * Reads pull live values out of ink's `variablesState`; writes clamp to the
 * stat's range and push back into ink so the narrative can branch on them.
 * Listeners (the HUD) are notified on any change.
 */
export class StatsManager {
  private readonly engine: StoryEngine;
  private readonly defs = new Map<string, StatDef>();
  private readonly listeners = new Set<() => void>();

  constructor(engine: StoryEngine, defs: readonly StatDef[]) {
    this.engine = engine;
    for (const def of defs) this.defs.set(def.key, def);
  }

  get(key: string): number {
    const raw = this.engine.getVariable(key);
    return typeof raw === "number" ? raw : 0;
  }

  set(key: string, value: number): void {
    const def = this.defs.get(key);
    const clamped = def ? clamp(value, def.min, def.max) : value;
    this.engine.setVariable(key, clamped);
    this.emit();
  }

  modify(key: string, delta: number): void {
    this.set(key, this.get(key) + delta);
  }

  /** Apply a parsed `# stat:` tag command. */
  apply(stat: string, op: "+" | "-" | "=", value: number): void {
    switch (op) {
      case "+":
        this.modify(stat, value);
        break;
      case "-":
        this.modify(stat, -value);
        break;
      case "=":
        this.set(stat, value);
        break;
    }
  }

  /** Current values for every declared stat, for HUD rendering. */
  snapshot(): StatSnapshot[] {
    return [...this.defs.values()].filter((def) => def.visible).map((def) => ({
      key: def.key,
      label: def.label,
      value: this.get(def.key),
      min: def.min,
      max: def.max,
    }));
  }

  /** Subscribe to stat changes; returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notify listeners — call after loading a save (values changed underneath). */
  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function clamp(value: number, min: number | null, max: number | null): number {
  const floored = min === null ? value : Math.max(min, value);
  return max === null ? floored : Math.min(max, floored);
}
