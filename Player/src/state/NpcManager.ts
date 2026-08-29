import type { StoryEngine } from "@/narrative/StoryEngine";
import {
  npcVar,
  type Npc,
  type NpcVariable,
} from "@/state/npcs";

/** A point-in-time view of one NPC, for the UI panel. */
export interface NpcSnapshot {
  id: string;
  name: string;
  stats: { key: string; label: string; value: number; min: number; max: number }[];
  statuses: { key: string; label: string; value: string }[];
  flags: { key: string; label: string; value: boolean }[];
}

type AttrEntry = { def: NpcVariable };

/**
 * Typed facade over the per-NPC ink variables.
 *
 * Mirrors {@link StatsManager}: reads pull live values from ink, writes clamp /
 * validate and push back into ink (so the story can branch on them and the save
 * system serialises them automatically). Listeners are notified on any change.
 */
export class NpcManager {
  private readonly engine: StoryEngine;
  private readonly defs: readonly Npc[];
  /** Lookup of `<id>\0<attr>` -> attribute descriptor, for applying tags. */
  private readonly attrs = new Map<string, AttrEntry>();
  private readonly listeners = new Set<() => void>();

  constructor(engine: StoryEngine, defs: readonly Npc[]) {
    this.engine = engine;
    this.defs = defs;
    for (const npc of defs) {
      for (const def of npc.variables) this.attrs.set(key(npc.inkId, def.key), { def });
    }
  }

  // --- stats ---

  getStat(id: string, attr: string): number {
    const raw = this.engine.getVariable(npcVar(id, attr));
    return typeof raw === "number" ? raw : 0;
  }

  setStat(id: string, attr: string, value: number): void {
    const entry = this.attrs.get(key(id, attr));
    const clamped =
      entry?.def.kind === "number" ? clamp(value, entry.def.min, entry.def.max) : value;
    this.engine.setVariable(npcVar(id, attr), clamped);
    this.emit();
  }

  modifyStat(id: string, attr: string, delta: number): void {
    this.setStat(id, attr, this.getStat(id, attr) + delta);
  }

  // --- status ---

  getStatus(id: string, attr: string): string {
    const raw = this.engine.getVariable(npcVar(id, attr));
    return typeof raw === "string" ? raw : "";
  }

  setStatus(id: string, attr: string, value: string): void {
    const entry = this.attrs.get(key(id, attr));
    if (entry?.def.kind === "text" && !entry.def.values.includes(value)) {
      console.warn(
        `Invalid status "${value}" for ${id}.${attr}; allowed: ${entry.def.values.join(", ")}`,
      );
      return;
    }
    this.engine.setVariable(npcVar(id, attr), value);
    this.emit();
  }

  // --- flags ---

  getFlag(id: string, attr: string): boolean {
    return this.engine.getVariable(npcVar(id, attr)) === true;
  }

  setFlag(id: string, attr: string, value: boolean): void {
    this.engine.setVariable(npcVar(id, attr), value);
    this.emit();
  }

  /** Apply a parsed `# npc:` tag, dispatching by the attribute's kind. */
  apply(id: string, attr: string, op: "+" | "-" | "=", value: string): void {
    const entry = this.attrs.get(key(id, attr));
    if (!entry) {
      console.warn(`Unknown NPC attribute: ${id}.${attr}`);
      return;
    }
    switch (entry.def.kind) {
      case "number": {
        const n = Number(value);
        if (Number.isNaN(n)) return;
        if (op === "+") this.modifyStat(id, attr, n);
        else if (op === "-") this.modifyStat(id, attr, -n);
        else this.setStat(id, attr, n);
        break;
      }
      case "text":
        this.setStatus(id, attr, value);
        break;
      case "boolean":
        this.setFlag(id, attr, value === "true" || value === "1");
        break;
    }
  }

  // --- snapshot / listeners ---

  snapshot(): NpcSnapshot[] {
    return this.defs.map((npc) => ({
      id: npc.inkId,
      name: npc.name,
      stats: npc.variables.filter((d) => d.kind === "number").map((d) => ({
        key: d.key,
        label: d.label,
        value: this.getStat(npc.inkId, d.key),
        min: d.min,
        max: d.max,
      })),
      statuses: npc.variables.filter((d) => d.kind === "text").map((d) => ({
        key: d.key,
        label: d.label,
        value: this.getStatus(npc.inkId, d.key),
      })),
      flags: npc.variables.filter((d) => d.kind === "boolean").map((d) => ({
        key: d.key,
        label: d.label,
        value: this.getFlag(npc.inkId, d.key),
      })),
    }));
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function key(id: string, attr: string): string {
  return `${id}\u0000${attr}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
