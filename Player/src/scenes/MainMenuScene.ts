import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SceneKey } from "@/config/gameConfig";
import { getAssetIndex, getBundle } from "@/bundle/registry";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
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

  /**
   * The picture behind the menu, when the game names one.
   *
   * Authored in `game.json` rather than by a tag, because the reader is here
   * before any ink has run — there is no line for a tag to sit on. A missing or
   * unloadable one leaves the plain colour, which is what every game without
   * one gets and is never worse than a broken menu.
   */
  private showStartupBackground(): void {
    const ref = getBundle(this).game.startupBackground;
    if (!ref) return;

    const resolved = getAssetIndex(this).resolveRef(ref);
    if (!resolved || resolved.kind !== "background" || isVideoFile(resolved.path)) return;

    const art = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, resolved.key).setDepth(-100);
    art.setScale(
      Math.max(GAME_WIDTH / Math.max(art.width, 1), GAME_HEIGHT / Math.max(art.height, 1)),
    );
  }

  /**
   * The game's name, as words or as a wordmark.
   *
   * The title belongs to the game, not the engine — one player, many games — so
   * everything here is authored in `game.json`, with the values this scene used
   * to hard-code as its defaults. A wordmark replaces the text rather than
   * joining it: no size or colour turns a picture of a name into a name.
   */
  private showTitle(): void {
    const bundle = getBundle(this);
    const title = bundle.game.title;

    if (title.art) {
      const resolved = getAssetIndex(this).resolveRef(title.art);
      if (resolved && !isVideoFile(resolved.path)) {
        const art = this.add.image(GAME_WIDTH / 2, 210, resolved.key).setOrigin(0.5);
        // Fitted rather than stretched: a wordmark drawn to the wrong aspect is
        // worse than a small one.
        const fit = Math.min(1, (GAME_WIDTH - 160) / Math.max(art.width, 1));
        art.setScale(fit);
        return;
      }
      // Falls through to the text, which is the only other name it has.
    }

    this.add
      .text(GAME_WIDTH / 2, 210, title.text.trim() || bundle.manifest.project.title, {
        fontFamily: "Georgia, serif",
        fontSize: `${title.size}px`,
        color: title.color,
        align: "center",
        wordWrap: { width: GAME_WIDTH - 160 },
      })
      .setOrigin(0.5);
  }

  create(): void {
    setControllerActions(this, { accept: () => this.startNewGame() });
    // Settings can change the visual treatment of every button. Rebuild this
    // scene when a modal returns so high contrast applies immediately.
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.scene.restart());
    this.cameras.main.setBackgroundColor("#0a0c14");
    this.showStartupBackground();

    this.showTitle();

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
