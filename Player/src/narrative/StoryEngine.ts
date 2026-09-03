import { Story } from "inkjs";
import { parseTags, type TagCommand } from "./tags";

/** One advanced line of narrative: the text plus its parsed tag commands. */
export interface StoryLine {
  text: string;
  tags: TagCommand[];
  /** The top-level Ink knot this line belongs to, before Continue moves past it. */
  knot: string | null;
}

/** A presentable choice. `index` is the value passed back to `choose`. */
export interface StoryChoice {
  text: string;
  index: number;
}

/**
 * Thin, typed wrapper around an inkjs `Story`.
 *
 * Responsibilities:
 *  - load a compiled story from a bundle's `story.json`,
 *  - advance the narrative one line at a time (with parsed tags),
 *  - surface choices,
 *  - serialise / restore state for the save system,
 *  - read/write story variables (used by StatsManager).
 *
 * It deliberately knows nothing about Phaser or rendering.
 */
export class StoryEngine {
  readonly story: Story;
  private readonly knots: string[];

  constructor(story: Story, knots: readonly string[] = []) {
    this.story = story;
    this.knots = [...new Set(knots.map((knot) => knot.split(".")[0]!).filter(Boolean))];
  }

  /**
   * Load compiled ink — a bundle's `story.json` — into a StoryEngine.
   *
   * There is deliberately no path that compiles `.ink` here. Compiling needs
   * `inkjs/full`, which is twice the size of the runtime, and it needs a file
   * handler to resolve `INCLUDE`s, which a browser has no way to provide.
   * InkCrafter compiles instead, with `countAllVisits` on so that
   * `VisitCountAtPathString` keeps working for every knot — that flag is baked
   * into the JSON as a per-container property, so it survives the trip.
   */
  static fromJson(storyJson: string, knots: readonly string[] = []): StoryEngine {
    return new StoryEngine(new Story(storyJson), knots);
  }

  get canContinue(): boolean {
    return this.story.canContinue;
  }

  /**
   * Advance one line. Caller should check `canContinue` first.
   * Skips over blank lines that ink sometimes emits for tag-only content.
   */
  continue(): StoryLine {
    const before = this.currentKnot()?.split(".")[0] ?? null;
    const visits = new Map(
      this.knots.map((knot) => [knot, this.story.state.VisitCountAtPathString(knot) ?? 0]),
    );
    const text = (this.story.Continue() ?? "").trim();
    const tags = parseTags(this.story.currentTags);
    const entered = this.knots.find(
      (knot) => (this.story.state.VisitCountAtPathString(knot) ?? 0) > (visits.get(knot) ?? 0),
    );
    const after = this.currentKnot()?.split(".")[0] ?? null;
    return { text, tags, knot: entered ?? before ?? after };
  }

  /** Choices available at the current stopping point (empty if none). */
  get choices(): StoryChoice[] {
    return this.story.currentChoices.map((c) => ({ text: c.text, index: c.index }));
  }

  /** True when the story has run out of content and choices (i.e. reached END). */
  get isEnded(): boolean {
    return !this.story.canContinue && this.story.currentChoices.length === 0;
  }

  /** Select a choice by its `index`. After this, `canContinue` becomes true. */
  choose(index: number): void {
    this.story.ChooseChoiceIndex(index);
  }

  /**
   * Jump the story to a knot/stitch path (used by the map to travel to a
   * location's scene). Resets the callstack so we arrive fresh at the target.
   */
  /**
   * Divert to a knot, resetting the callstack — travel, not a choice.
   *
   * Returns false rather than throwing on a path the story does not have.
   * `ChoosePathString` throws, and it is called from a click handler with the
   * map already closing, which leaves the scene wedged with nothing on screen
   * to explain it. The editor checks every travel target at export, so this is
   * a backstop rather than the defence.
   */
  goTo(path: string): boolean {
    try {
      this.story.ChoosePathString(path, true);
      return true;
    } catch (error) {
      console.error(`Cannot travel to "${path}" — the story has no such knot.`, error);
      return false;
    }
  }

  /** How many times a knot/stitch path has been visited (for progression gating). */
  visitCount(path: string): number {
    return this.story.state.VisitCountAtPathString(path) ?? 0;
  }

  /**
   * Where the story is now, as a knot or `knot.stitch`.
   *
   * ink's own path carries the position *within* the content as trailing
   * numbers — `city.market.3` — and nothing outside the engine has any use for
   * those. They are dropped so what comes back is the name an author wrote and
   * a map can claim.
   */
  currentKnot(): string | null {
    const path = this.story.state.currentPathString;
    if (!path) return null;

    const named = path.split(".").filter((part) => !/^\d+$/.test(part));
    return named.length > 0 ? named.join(".") : null;
  }

  // --- variables (used by StatsManager) ---

  getVariable(name: string): unknown {
    return this.story.variablesState[name];
  }

  setVariable(name: string, value: number | string | boolean): void {
    this.story.variablesState[name] = value;
  }

  /** Observe one declared Ink global until the returned disposer is called. */
  observeVariable(name: string, listener: (value: unknown) => void): () => void {
    const observer: Story.VariableObserver = (_variableName, value) => listener(value as unknown);
    this.story.ObserveVariable(name, observer);
    return () => this.story.RemoveVariableObserver(observer, name);
  }

  // --- save / load ---

  /** Serialise the full runtime state (progress + variables) to a JSON string. */
  saveState(): string {
    return this.story.state.ToJson();
  }

  /** Restore runtime state previously produced by {@link saveState}. */
  loadState(json: string): void {
    this.story.state.LoadJson(json);
  }

  /** Reset to the beginning of the story. */
  reset(): void {
    this.story.ResetState();
  }
}
