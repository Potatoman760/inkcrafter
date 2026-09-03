import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "@/config/gameConfig";
import {
  gameBaseUrl,
  loadBundle,
  loadPreviewCheckpoint,
  requestedPreviewId,
  requestedMinigameName,
} from "@/bundle/loadBundle";
import { BUNDLE_KEY, PREVIEW_CHECKPOINT_KEY, TEST_MINIGAME_KEY } from "@/bundle/registry";
import { SaveManager } from "@/save/SaveManager";
import { BootScene } from "@/scenes/BootScene";
import { MainMenuScene } from "@/scenes/MainMenuScene";
import { SettingsScene } from "@/scenes/SettingsScene";
import { VNScene } from "@/scenes/VNScene";
import { SaveLoadScene } from "@/scenes/SaveLoadScene";
import { MapScene } from "@/scenes/MapScene";
import { CharacterScene } from "@/scenes/CharacterScene";
import { GalleryScene } from "@/scenes/GalleryScene";
import { CombatScene } from "@/scenes/CombatScene";
import { QuickhandsScene } from "@/scenes/QuickhandsScene";
import { CarryScene } from "@/scenes/CarryScene";
import { PowerStrikeScene } from "@/scenes/PowerStrikeScene";
import { GalleryUnlocks } from "@/gallery/GalleryUnlocks";
import { formatUiText, UI_TEXT } from "@/config/uiText";
import { PlayerStorage } from "@/platform/Storage";
import { AudioSettings } from "@/audio/AudioSettings";
import { PlayerSettings } from "@/settings/PlayerSettings";
import { installLifecycleHandling } from "@/platform/lifecycle";
import { installDiagnostics } from "@/platform/diagnostics";

installDiagnostics();

/**
 * The game's bundle is fetched before Phaser starts.
 *
 * `preload` is not asynchronous, so a scene cannot both fetch the manifest and
 * register the files it names. Loading first and handing the result in through
 * `preBoot` means `BootScene` starts with everything already in hand.
 *
 * A game that will not load is reported in the page rather than the console.
 * It is the one failure a player can actually do something about — the wrong
 * folder, or an export that never finished — so it needs to be legible.
 */
async function start(): Promise<void> {
  await PlayerStorage.initialize();
  AudioSettings.reload();
  PlayerSettings.reload();
  const base = gameBaseUrl();
  const previewId = requestedPreviewId();
  const testMinigame = requestedMinigameName();

  let bundle;
  let preview = null;
  try {
    bundle = await loadBundle(base, previewId);
    if (previewId) preview = await loadPreviewCheckpoint(bundle, previewId);
  } catch (error) {
    showFailure(base, error);
    return;
  }

  // Slots are per game, and every game on this origin shares one localStorage.
  // Naming the game here, before Phaser exists, is the only point at which no
  // scene can already have read a slot.
  SaveManager.use(bundle.manifest.project.id, { volatile: preview !== null });
  GalleryUnlocks.use(bundle, { volatile: preview !== null });

  // The engine has no title of its own; the game it loaded does.
  if (bundle.manifest.project.title) document.title = bundle.manifest.project.title;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#05060a",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    callbacks: {
      preBoot: (game) => {
        game.registry.set(BUNDLE_KEY, bundle);
        if (preview) game.registry.set(PREVIEW_CHECKPOINT_KEY, preview);
        if (testMinigame) game.registry.set(TEST_MINIGAME_KEY, testMinigame);
      },
    },
    scene: [
      BootScene,
      MainMenuScene,
      SettingsScene,
      VNScene,
      SaveLoadScene,
      MapScene,
      CharacterScene,
      GalleryScene,
      CombatScene,
      QuickhandsScene,
      CarryScene,
      PowerStrikeScene,
    ],
  });
  installLifecycleHandling(game);
}

function showFailure(base: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(error);

  const host = document.getElementById("game") ?? document.body;
  const panel = document.createElement("div");
  panel.style.cssText =
    "font:16px/1.6 system-ui,sans-serif;color:#cfd8ee;max-width:46rem;margin:4rem auto;padding:0 1.5rem";
  panel.innerHTML =
    `<h1 style='font-size:1.3rem;margin:0 0 .75rem'>${UI_TEXT.loadErrorTitle}</h1>` +
    `<p style='margin:0 0 .75rem'>${formatUiText(UI_TEXT.loadErrorLocation, { base: escapeHtml(base) })}</p>` +
    `<p style='margin:0 0 .75rem;color:#8e9ab5'>${escapeHtml(reason)}</p>` +
    `<p style='margin:0;color:#8e9ab5'>${UI_TEXT.loadErrorHelp}</p>`;
  host.append(panel);
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

void start();
