import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "@/config/gameConfig";
import { UI_TEXT } from "@/config/uiText";
import { PlayerSettings } from "@/settings/PlayerSettings";

const BOX_MARGIN = 40;
const BOX_HEIGHT = 200;
const PAD = 28;

/** The stage-space edge other UI must clear while dialogue is visible. */
export const DIALOGUE_TOP = GAME_HEIGHT - BOX_HEIGHT - BOX_MARGIN;

/**
 * Bottom dialogue panel: a speaker label and a body line that reveals with a
 * typewriter effect. Click handling lives in the scene; the scene calls
 * `skip()` to finish the reveal early, then advances on the next click.
 */
export class DialogueBox {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly speakerText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  private fullText = "";
  private typeEvent?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const width = GAME_WIDTH - BOX_MARGIN * 2;

    const bg = scene.add.graphics();
    bg.fillStyle(0x0a0c14, 0.82);
    bg.fillRoundedRect(0, 0, width, BOX_HEIGHT, 16);
    bg.lineStyle(2, 0x5a6b8c, 0.8);
    bg.strokeRoundedRect(0, 0, width, BOX_HEIGHT, 16);

    this.speakerText = scene.add.text(PAD, -16, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "24px",
      color: "#ffd98a",
      fontStyle: "bold",
      backgroundColor: "#1b2238",
      padding: { x: 12, y: 6 },
    });

    this.bodyText = scene.add.text(PAD, PAD + 8, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(23 * PlayerSettings.textScale)}px`,
      color: "#f2f2f2",
      wordWrap: { width: width - PAD * 2 },
      lineSpacing: 6,
    });

    // A marker, not an instruction. Nobody needs telling to click, but they do
    // need telling that the line has finished arriving and there is more after
    // it — which is the one thing this says.
    this.hint = scene.add
      .text(width - PAD, BOX_HEIGHT - 14, UI_TEXT.dialogueMoreMarker, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#8fa0c0",
      })
      .setOrigin(1, 1)
      .setVisible(false);

    this.container = scene.add
      .container(BOX_MARGIN, DIALOGUE_TOP, [bg, this.speakerText, this.bodyText, this.hint])
      .setDepth(200);
  }

  /** Show a new line, starting the typewriter reveal. */
  setLine(speaker: string, text: string): void {
    this.stopTyping();
    this.speakerText.setText(speaker).setVisible(speaker.length > 0);
    this.fullText = text;
    this.bodyText.setText("");
    this.hint.setVisible(false);

    const delay = PlayerSettings.typeDelay;
    if (delay === 0) {
      this.bodyText.setText(this.fullText);
      this.finish();
      return;
    }

    let i = 0;
    this.typeEvent = this.scene.time.addEvent({
      delay,
      loop: true,
      callback: () => {
        i++;
        this.bodyText.setText(this.fullText.slice(0, i));
        if (i >= this.fullText.length) this.finish();
      },
    });
  }

  /** True while characters are still being revealed. */
  get isTyping(): boolean {
    return this.typeEvent !== undefined;
  }

  /** Reveal the whole line immediately. */
  skip(): void {
    if (!this.isTyping) return;
    this.bodyText.setText(this.fullText);
    this.finish();
  }

  /** Mark a dead end: keep the line shown but hide the "continue" prompt. */
  markEndOfContent(): void {
    this.stopTyping();
    this.hint.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /** Whether the panel is on screen — it is hidden while a clip plays. */
  get visible(): boolean {
    return this.container.visible;
  }

  private finish(): void {
    this.stopTyping();
    this.hint.setVisible(true);
  }

  private stopTyping(): void {
    this.typeEvent?.remove();
    this.typeEvent = undefined;
  }
}
