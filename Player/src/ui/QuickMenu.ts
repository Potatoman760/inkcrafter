import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "@/config/gameConfig";
import { makeButton } from "@/ui/Button";

/** One entry in the bar. Label and availability are asked for, not stored. */
export interface QuickItem {
  /** A function, because Skip has two labels and one of them is a state. */
  label: () => string;
  onClick: () => void;
  /** Defaults to always available. */
  enabled?: () => boolean;
}

const ITEM = { width: 104, height: 28, gap: 8 } as const;

/** The strip below the dialogue box, where the bar sits. */
const BAR_Y = GAME_HEIGHT - 20;

/**
 * The quick menu: the row of small controls along the bottom of the screen.
 *
 * The things a reader does *to* the story rather than *in* it — step back, skip
 * ahead, drop a bookmark and pick it up again. They live in one row along the
 * bottom edge because that is where a visual-novel reader looks for them, and
 * because a control that belongs to the reading session should not be mixed in
 * with the story's own furniture.
 *
 * Rebuilt rather than restyled on every change, like the other buttons here:
 * `makeButton` draws a button and does not own one, so a label or an enabled
 * state that has moved means drawing it again.
 */
export class QuickMenu {
  private readonly scene: Phaser.Scene;
  private readonly items: readonly QuickItem[];
  private buttons: Phaser.GameObjects.Container[] = [];
  private shown = true;

  constructor(scene: Phaser.Scene, items: readonly QuickItem[]) {
    this.scene = scene;
    this.items = items;
    this.refresh();
  }

  refresh(): void {
    for (const button of this.buttons) button.destroy();
    this.buttons = [];

    const span = this.items.length * ITEM.width + (this.items.length - 1) * ITEM.gap;
    let x = GAME_WIDTH / 2 - span / 2 + ITEM.width / 2;

    for (const item of this.items) {
      const button = makeButton(this.scene, x, BAR_Y, item.label(), item.onClick, {
        width: ITEM.width,
        height: ITEM.height,
        fontSize: "15px",
        enabled: item.enabled?.() ?? true,
      });
      this.buttons.push(button.setDepth(400).setVisible(this.shown));
      x += ITEM.width + ITEM.gap;
    }
  }

  /** Hidden with the dialogue it belongs beside, while a clip plays. */
  setVisible(visible: boolean): void {
    this.shown = visible;
    for (const button of this.buttons) button.setVisible(visible);
  }
}
