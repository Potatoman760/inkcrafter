import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SceneKey } from "@/config/gameConfig";
import { getBundle } from "@/bundle/registry";
import { getGameState } from "@/state/registry";
import { SaveManager } from "@/save/SaveManager";
import { makeButton } from "@/ui/Button";
import { UI_TEXT } from "@/config/uiText";
import { desktopBridge } from "@/platform/desktop";
import { setControllerActions } from "@/input/FocusNavigation";

/** Title screen: starting, loading, and player-wide settings. */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.MainMenu);
  }

  create(): void {
    setControllerActions(this, { accept: () => this.startNewGame() });
    // Settings can change the visual treatment of every button. Rebuild this
    // scene when a modal returns so high contrast applies immediately.
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
    this.cameras.main.setBackgroundColor("#0a0c14");

    // The title belongs to the game, not the engine — one player, many games.
    this.add
      .text(GAME_WIDTH / 2, 210, getBundle(this).manifest.project.title, {
        fontFamily: "Georgia, serif",
        fontSize: "64px",
        color: "#ffd98a",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 160 },
      })
      .setOrigin(0.5);

    const cx = GAME_WIDTH / 2;
    let y = GAME_HEIGHT / 2 - 40;

    makeButton(this, cx, y, UI_TEXT.mainMenuNewGame, () => this.startNewGame());
    y += 65;

    makeButton(this, cx, y, UI_TEXT.mainMenuContinue, () => this.continueGame(), {
      enabled: SaveManager.hasAnySave(getGameState(this)),
    });
    y += 65;

    makeButton(this, cx, y, UI_TEXT.mainMenuLoadGame, () => this.openLoad());
    y += 65;

    makeButton(this, cx, y, UI_TEXT.mainMenuGallery, () => this.openGallery(), {
      enabled: getBundle(this).gallery.groups.length > 0,
    });
    y += 65;

    makeButton(this, cx, y, UI_TEXT.mainMenuSettings, () => this.openSettings());
    if (desktopBridge()) {
      y += 65;
      makeButton(this, cx, y, UI_TEXT.mainMenuQuit, () => desktopBridge()?.app.quit());
    }
  }

  private startNewGame(): void {
    const state = getGameState(this);
    state.newGame();
    this.scene.start(SceneKey.VN, { mode: "new" });
  }

  private continueGame(): void {
    const state = getGameState(this);
    const data = SaveManager.loadLatest(state);
    if (!data) return;
    if (!SaveManager.apply(state, data)) return;
    this.scene.start(SceneKey.VN, { mode: "resume" });
  }

  private openLoad(): void {
    this.scene.launch(SceneKey.SaveLoad, { origin: SceneKey.MainMenu });
    this.scene.pause();
  }

  private openSettings(): void {
    this.scene.launch(SceneKey.Settings);
    this.scene.pause();
  }

  private openGallery(): void {
    this.scene.start(SceneKey.Gallery);
  }
}
