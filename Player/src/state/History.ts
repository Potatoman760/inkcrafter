import type { GameState, SceneMeta } from "@/state/GameState";

/**
 * How many steps back a reader can take.
 *
 * Bounded because each frame holds a whole serialised ink state, and a long
 * session would otherwise keep every line of it in memory for the sake of a
 * button nobody presses forty times in a row.
 */
export const HISTORY_LIMIT = 50;

/** A moment the reader could want to return to. */
interface Frame {
  inkState: string;
  sceneMeta: SceneMeta;
}

/**
 * The steps a reader can take back.
 *
 * ink has no rollback of its own — `Continue()` moves the story and there is no
 * undo — so going back means having kept the state it moved from. That is the
 * same serialisation a save is made of, held in memory instead of in
 * `localStorage`; keeping it bounded matters more than any one snapshot.
 *
 * Recorded at the moments a reader *acts*: advancing a line, taking a choice,
 * or a step of a skip. Not on the internal continuation of a tag-only line,
 * which shows nothing and would be a step back to the same picture.
 */
export class History {
  private readonly frames: Frame[] = [];

  /** Remember where the story is, before something moves it. */
  push(state: GameState): void {
    this.frames.push({
      inkState: state.engine.saveState(),
      sceneMeta: structuredClone(state.sceneMeta),
    });
    if (this.frames.length > HISTORY_LIMIT) this.frames.shift();
  }

  /**
   * Step back onto the last remembered frame, or return false if there is none.
   *
   * The frame is applied here rather than handed back, so that a caller cannot
   * take a step back and forget to restore half of it.
   */
  back(state: GameState): boolean {
    const frame = this.frames.pop();
    if (!frame) return false;

    try {
      state.engine.loadState(frame.inkState);
    } catch (err) {
      // Nothing else in the player can produce a state ink refuses, so this is
      // a bug rather than a bad save; drop the frame and stay put.
      console.error("Could not step back.", err);
      return false;
    }
    state.sceneMeta = structuredClone(frame.sceneMeta);
    state.refresh();
    return true;
  }

  get canGoBack(): boolean {
    return this.frames.length > 0;
  }

  /**
   * Forget everything.
   *
   * Called when the story is moved by something other than reading it — a load,
   * or travelling from the map. The frames before such a jump are real
   * positions, but stepping "back" into them would be a jump of its own, not
   * the undo the button promises.
   */
  clear(): void {
    this.frames.length = 0;
  }
}
