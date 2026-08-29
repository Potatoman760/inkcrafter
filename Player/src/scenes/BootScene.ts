import Phaser from "phaser";
import { MINIGAME_SCENES, SceneKey } from "@/config/gameConfig";
import { AssetIndex } from "@/bundle/AssetIndex";
import { ASSET_INDEX_KEY, getBundle, getPreviewCheckpoint, getTestMinigame } from "@/bundle/registry";
import { GameState } from "@/state/GameState";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { assertNever } from "@/util/exhaustive";
import { UI_TEXT } from "@/config/uiText";

/** Registry key under which the shared GameState is stored. */
export const GAME_STATE_KEY = "gameState";

/**
 * Registers the bundle's media with the loader, builds the shared GameState,
 * then hands off to the main menu.
 *
 * The story is no longer compiled here — it arrives compiled in the bundle —
 * and the files to load are no longer a list in the source. Both come from
 * `media.json`, so adding a picture to a story is something the author does in
 * the editor rather than something that rebuilds the game.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    const assets = AssetIndex.from(getBundle(this));
    this.registry.set(ASSET_INDEX_KEY, assets);

    for (const { asset, url } of assets.files) {
      // The exporter reads the kind off the file now, so the manifest is right
      // about this. Asked again anyway, because a bundle exported before it did
      // labels a clip an image, and one of those decoded as a texture fails a
      // long way from here with nothing to say about why.
      const kind = isVideoFile(asset.path) ? "video" : asset.kind;

      switch (kind) {
        case "video":
          // Keep the embedded audio track. Audible video playback waits for a
          // browser interaction when required; Phaser retries it once the
          // browser's media lock has been released.
          this.load.video(asset.key, url, false);
          break;
        case "audio":
          this.load.audio(asset.key, url);
          break;
        case "image":
          this.load.image(asset.key, url);
          break;
        // Named one by one rather than defaulting to `load.image`: a kind added
        // later would otherwise be handed to the picture loader, and a track
        // decoded as a texture fails somewhere a long way from here.
        default:
          assertNever(kind);
      }
    }

    this.showLoadingText();
  }

  create(): void {
    const preview = getPreviewCheckpoint(this);
    const testMinigame = getTestMinigame(this);
    // Editor previews are disposable authoring sessions: they must never earn
    // a real customer's Steam achievements or persist local unlock records.
    const state = GameState.fromBundle(getBundle(this), { achievementsEnabled: preview === null });
    this.registry.set(GAME_STATE_KEY, state);
    const testKind = testMinigame
      ? state.bundle.minigames.minigames.find((game) => game.name === testMinigame)?.kind
      : undefined;
    const testScene = testKind ? MINIGAME_SCENES[testKind] : null;

    if (preview) {
      state.loadPreview(preview.inkState);
      this.scene.start(
        testScene ?? SceneKey.VN,
        testMinigame ? { name: testMinigame, mode: "test" } : { mode: "preview" },
      );
    } else if (testMinigame) {
      state.newGame();
      this.scene.start(testScene ?? SceneKey.Combat, { name: testMinigame, mode: "test" });
    } else {
      this.scene.start(SceneKey.MainMenu);
    }
  }

  private showLoadingText(): void {
    const { width, height } = this.scale;
    const label = this.add
      .text(width / 2, height / 2, UI_TEXT.loading, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#cfd8ee",
      })
      .setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.COMPLETE, () => label.destroy());
  }
}
