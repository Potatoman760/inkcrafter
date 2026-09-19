import Phaser from "phaser";
import { getBundle } from "@/bundle/registry";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { UI_TEXT } from "@/config/uiText";
import { AdultConfirmation } from "@/settings/AdultConfirmation";
import { makeButton } from "@/ui/Button";

/** Blocks the title screen until the reader makes the one-time 18+ declaration. */
export class AdultConfirmationScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.AdultConfirmation);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0a0c14");
    this.showQuestion();
  }

  private showQuestion(): void {
    this.children.removeAll(true);
    this.add
      .text(GAME_WIDTH / 2, 245, UI_TEXT.adultConfirmationDeclaration, {
        fontFamily: "Georgia, serif",
        fontSize: "36px",
        color: "#f2f2f2",
        align: "center",
        lineSpacing: 10,
        wordWrap: { width: 900 },
      })
      .setOrigin(0.5);

    makeButton(
      this,
      GAME_WIDTH / 2 - 190,
      455,
      UI_TEXT.adultConfirmationYes,
      () => this.confirm(),
      { width: 330 },
    );
    makeButton(
      this,
      GAME_WIDTH / 2 + 190,
      455,
      UI_TEXT.adultConfirmationNo,
      () => this.deny(),
      { width: 330 },
    );
  }

  private confirm(): void {
    AdultConfirmation.confirm(getBundle(this).manifest.project.id);
    this.scene.start(SceneKey.MainMenu);
  }

  private deny(): void {
    // No title-screen transition is available from this state. Relaunching
    // asks again because only an affirmative answer is ever persisted.
    this.children.removeAll(true);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI_TEXT.adultConfirmationDenied, {
        fontFamily: "Georgia, serif",
        fontSize: "36px",
        color: "#f2f2f2",
        align: "center",
        wordWrap: { width: 900 },
      })
      .setOrigin(0.5);
  }
}
