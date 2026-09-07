import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import { makeButton } from "@/ui/Button";
import { UI_TEXT } from "@/config/uiText";
import { setControllerActions } from "@/input/FocusNavigation";

export interface WordData {
  /** The text variable the answer is written into. */
  variable: string;
  /** The question above the field: "What Piri calls you". */
  label: string;
  origin: SceneKey;
}

const FIELD_WIDTH = 420;
/** Long enough for a name or a pet name, short enough to sit in a line of dialogue. */
const MAX_LENGTH = 32;

/**
 * A word the reader chooses, asked for at the moment the story first uses it.
 *
 * What a character calls the reader is the reader's to pick, and the authored
 * value is only a suggestion — so the field opens already holding it, and
 * leaving it alone keeps the story exactly as written. The answer goes into an
 * ordinary Ink variable, which means every later line that interpolates it
 * says the reader's word, and the save carries it with everything else.
 *
 * A real `<input>` over the canvas rather than keys collected by Phaser: this
 * is somebody typing their own word, and that wants a caret, selection, a
 * native keyboard on a tablet, and paste.
 */
export class WordScene extends Phaser.Scene {
  private origin!: SceneKey;
  private field: HTMLInputElement | null = null;
  private done = false;

  constructor() {
    super(SceneKey.Word);
  }

  create(data: WordData): void {
    this.origin = data.origin;
    this.done = false;
    this.field = null;

    const state = getGameState(this);
    const current = state.engine.getVariable(data.variable);
    const suggested = typeof current === "string" ? current : "";

    setControllerActions(this, { back: () => this.keep() });
    this.input.keyboard?.on("keydown-ESC", this.keep, this);

    // Nothing behind this can be clicked: the story is paused mid-line, and a
    // stray click reaching it would advance past the moment being asked about.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();

    const panelWidth = 560;
    const panelHeight = 260;
    const left = (GAME_WIDTH - panelWidth) / 2;
    const top = (GAME_HEIGHT - panelHeight) / 2;

    this.add
      .rectangle(left, top, panelWidth, panelHeight, 0x101525, 0.98)
      .setOrigin(0)
      .setStrokeStyle(2, 0x5a6b8c, 0.9);

    this.add.text(left + 32, top + 28, data.label, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "26px",
      fontStyle: "bold",
      color: "#f2f2f2",
      wordWrap: { width: panelWidth - 64 },
    });

    this.add.text(left + 32, top + 74, UI_TEXT.wordHint, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      color: "#a8b0c4",
      wordWrap: { width: panelWidth - 64 },
    });

    const input = document.createElement("input");
    input.type = "text";
    input.value = suggested;
    input.maxLength = MAX_LENGTH;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", data.label);
    input.style.cssText =
      `width:${FIELD_WIDTH}px;height:44px;box-sizing:border-box;padding:2px 12px;pointer-events:auto;` +
      "background:#0a0e1a;border:1px solid #5a6b8c;border-radius:4px;color:#f2f2f2;" +
      "font:400 22px system-ui,sans-serif;outline:none;caret-color:#8fb3ff;";
    this.field = input;
    this.add.dom(GAME_WIDTH / 2, top + 140, input);

    input.addEventListener("keydown", (event) => {
      // The VN beneath listens for Enter and Space to advance. Neither should
      // reach it while somebody is typing a word into this.
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.commit(data.variable, input.value);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.keep();
      }
    });
    queueMicrotask(() => {
      if (this.field === input) {
        input.focus();
        input.select();
      }
    });

    makeButton(
      this,
      GAME_WIDTH / 2 - 100,
      top + panelHeight - 52,
      UI_TEXT.wordKeep,
      () => this.keep(),
      { width: 170, height: 48, fontSize: "18px" },
    );
    makeButton(
      this,
      GAME_WIDTH / 2 + 100,
      top + panelHeight - 52,
      UI_TEXT.wordUse,
      () => this.commit(data.variable, this.field?.value ?? suggested),
      { width: 170, height: 48, fontSize: "18px" },
    );
  }

  /**
   * Writes the answer, unless it is empty.
   *
   * A blank field is a reader who cleared it rather than one who chose
   * nothing to be called, and writing it would leave a line with a hole in the
   * middle of a sentence. The authored word stands instead.
   */
  private commit(variable: string, value: string): void {
    if (this.done) return;
    const chosen = value.trim();
    if (chosen.length > 0) getGameState(this).engine.setVariable(variable, chosen);
    this.finish();
  }

  /** Leaves the story's own word in place. */
  private keep(): void {
    if (this.done) return;
    this.finish();
  }

  private finish(): void {
    this.done = true;
    this.field = null;
    this.scene.stop();
    this.scene.resume(this.origin);
  }
}
