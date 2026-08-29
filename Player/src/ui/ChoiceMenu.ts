import Phaser from "phaser";
import { GAME_WIDTH } from "@/config/gameConfig";
import type { StoryChoice } from "@/narrative/StoryEngine";
import { DIALOGUE_TOP } from "@/ui/DialogueBox";
import { PlayerSettings } from "@/settings/PlayerSettings";
import { focusPreferred, registerFocusable } from "@/input/FocusNavigation";

const MAX_CHOICES = 10;
const BTN_WIDTH = 420;
const RIGHT_MARGIN = 36;
const LIST_TOP = 72;
/** Keep every choice visibly separate from the dialogue panel below it. */
const LIST_BOTTOM = DIALOGUE_TOP - 20;

interface ChoiceLayout {
  buttonHeight: number;
  gap: number;
  fontSize: string;
}

function layoutFor(choiceCount: number): ChoiceLayout {
  const gap = choiceCount >= 8 ? 4 : choiceCount >= 5 ? 8 : 12;
  const preferredHeight = choiceCount <= 3 ? 58 : choiceCount <= 6 ? 52 : 48;
  const availableHeight = LIST_BOTTOM - LIST_TOP;
  const fittedHeight = (availableHeight - gap * (choiceCount - 1)) / choiceCount;

  return {
    buttonHeight: Math.min(preferredHeight, fittedHeight),
    gap,
    fontSize:
      choiceCount <= 4
        ? "19px"
        : choiceCount <= 7
          ? "17px"
          : choiceCount === 8
            ? "15px"
            : "14px",
  };
}

/**
 * Renders the current ink choices as a vertical stack of clickable buttons.
 * `present` shows them and resolves the user's selection via the `onSelect`
 * callback; `clear` removes them.
 */
export class ChoiceMenu {
  private readonly scene: Phaser.Scene;
  private readonly objects: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  present(choices: StoryChoice[], onSelect: (index: number) => void): void {
    this.clear();
    const visibleChoices = choices.slice(0, MAX_CHOICES);
    if (choices.length > MAX_CHOICES) {
      console.warn(`ChoiceMenu supports up to ${MAX_CHOICES} choices; ${choices.length - MAX_CHOICES} hidden.`);
    }

    const { buttonHeight, gap, fontSize } = layoutFor(visibleChoices.length);
    const availableHeight = LIST_BOTTOM - LIST_TOP;
    const totalHeight = visibleChoices.length * buttonHeight + (visibleChoices.length - 1) * gap;
    const x = GAME_WIDTH - RIGHT_MARGIN - BTN_WIDTH / 2;
    let y = LIST_TOP + (availableHeight - totalHeight) / 2;

    for (const choice of visibleChoices) {
      const bg = this.scene.add
        .rectangle(x, y + buttonHeight / 2, BTN_WIDTH, buttonHeight, 0x1b2238, 0.92)
        .setStrokeStyle(2, 0x5a6b8c, 0.9)
        .setDepth(300)
        .setInteractive({ useHandCursor: true });

      const label = this.scene.add
        .text(x, y + buttonHeight / 2, choice.text, {
          fontFamily: "system-ui, sans-serif",
          fontSize: `${Math.round(Number.parseInt(fontSize, 10) * PlayerSettings.textScale)}px`,
          color: "#f2f2f2",
          align: "center",
          wordWrap: { width: BTN_WIDTH - 28 },
          maxLines: 2,
        })
        .setOrigin(0.5)
        .setDepth(301);

      bg.on("pointerover", () => bg.setFillStyle(0x2a3354, 0.98));
      bg.on("pointerout", () => bg.setFillStyle(0x1b2238, 0.92));
      bg.on("pointerdown", () => {
        this.clear();
        onSelect(choice.index);
      });
      registerFocusable(this.scene, {
        object: bg,
        preferred: choice === visibleChoices[0],
        activate: () => {
          this.clear();
          onSelect(choice.index);
        },
        onFocus: (focused) => bg.setFillStyle(focused ? 0x2a3354 : 0x1b2238, focused ? 0.98 : 0.92),
      });

      this.objects.push(bg, label);
      y += buttonHeight + gap;
    }
    focusPreferred(this.scene);
  }

  /**
   * Hidden with the rest of the interface while the art is being looked at.
   *
   * Hiding takes the clicks with it, which is the point: Phaser does not
   * hit-test what it would not draw, so a choice nobody can see is also a
   * choice nobody can take by accident.
   */
  setVisible(visible: boolean): void {
    for (const obj of this.objects) obj.setVisible(visible);
  }

  get isOpen(): boolean {
    return this.objects.length > 0;
  }

  clear(): void {
    for (const obj of this.objects) obj.destroy();
    this.objects.length = 0;
  }
}
