import Phaser from "phaser";
import { AudioSettings, type AudioSetting } from "@/audio/AudioSettings";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { UI_TEXT } from "@/config/uiText";
import { DisplayControl } from "@/platform/display";
import { PlayerSettings, type TextSize, type TextSpeed } from "@/settings/PlayerSettings";
import { makeButton } from "@/ui/Button";
import { VolumeSlider } from "@/ui/VolumeSlider";
import { setControllerActions } from "@/input/FocusNavigation";

/** Modal player-wide audio, display, and reading preferences. */
export class SettingsScene extends Phaser.Scene {
  private fullscreen = false;

  constructor() {
    super(SceneKey.Settings);
  }

  create(): void {
    setControllerActions(this, { back: () => this.close() });
    this.input.resetCursor();
    this.input.keyboard?.on("keydown-ESC", this.close, this);
    void DisplayControl.isFullscreen().then((value) => {
      if (!this.scene.isActive()) return;
      this.fullscreen = value;
      this.render();
    });
    this.render();
  }

  private render(): void {
    this.children.removeAll(true);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82).setOrigin(0);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1140, 650, 0x101525, 0.99)
      .setStrokeStyle(2, 0x5a6b8c, 0.9);
    this.add.text(GAME_WIDTH / 2, 55, UI_TEXT.settingsTitle, {
      fontFamily: "Georgia, serif", fontSize: "42px", color: "#ffd98a",
    }).setOrigin(0.5);

    this.heading(330, 112, UI_TEXT.settingsAudio);
    const levels = AudioSettings.levels;
    this.addSlider(330, 190, UI_TEXT.settingsMasterVolume, "master", levels.master);
    this.addSlider(330, 300, UI_TEXT.settingsMusicVolume, "music", levels.music);
    this.addSlider(330, 410, UI_TEXT.settingsSfxVolume, "sfx", levels.sfx);

    this.heading(880, 112, UI_TEXT.settingsDisplayAccessibility);
    this.row(650, 175, UI_TEXT.settingsFullscreen, [
      [UI_TEXT.settingsOff, !this.fullscreen, () => this.setFullscreen(false)],
      [UI_TEXT.settingsOn, this.fullscreen, () => this.setFullscreen(true)],
    ]);
    const prefs = PlayerSettings.values;
    this.row(650, 255, UI_TEXT.settingsDialogueText, [
      [UI_TEXT.settingsSmall, prefs.textSize === "small", () => this.setTextSize("small")],
      [UI_TEXT.settingsNormal, prefs.textSize === "normal", () => this.setTextSize("normal")],
      [UI_TEXT.settingsLarge, prefs.textSize === "large", () => this.setTextSize("large")],
    ]);
    this.row(650, 335, UI_TEXT.settingsTextSpeed, [
      [UI_TEXT.settingsSlow, prefs.textSpeed === "slow", () => this.setTextSpeed("slow")],
      [UI_TEXT.settingsNormal, prefs.textSpeed === "normal", () => this.setTextSpeed("normal")],
      [UI_TEXT.settingsFast, prefs.textSpeed === "fast", () => this.setTextSpeed("fast")],
      [UI_TEXT.settingsInstant, prefs.textSpeed === "instant", () => this.setTextSpeed("instant")],
    ]);
    this.row(650, 415, UI_TEXT.settingsReducedMotion, [
      [UI_TEXT.settingsOff, !prefs.reducedMotion, () => this.setBoolean("reducedMotion", false)],
      [UI_TEXT.settingsOn, prefs.reducedMotion, () => this.setBoolean("reducedMotion", true)],
    ]);
    this.row(650, 495, UI_TEXT.settingsHighContrast, [
      [UI_TEXT.settingsOff, !prefs.highContrast, () => this.setBoolean("highContrast", false)],
      [UI_TEXT.settingsOn, prefs.highContrast, () => this.setBoolean("highContrast", true)],
    ]);

    makeButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 58, UI_TEXT.settingsClose, () => this.close(), {
      width: 240, height: 48,
    });
  }

  private heading(x: number, y: number, text: string): void {
    this.add.text(x, y, text, {
      fontFamily: "system-ui, sans-serif", fontSize: "24px", color: "#cfd8ee", fontStyle: "bold",
    }).setOrigin(0.5);
  }

  private addSlider(x: number, y: number, label: string, setting: AudioSetting, value: number): void {
    new VolumeSlider(this, x, y, label, value, (next) => AudioSettings.set(setting, next), 390);
  }

  private row(
    x: number,
    y: number,
    label: string,
    options: ReadonlyArray<readonly [string, boolean, () => void]>,
  ): void {
    this.add.text(x, y - 25, label, {
      fontFamily: "system-ui, sans-serif", fontSize: "18px", color: "#f2f2f2",
    });
    const width = Math.min(112, 440 / options.length);
    options.forEach(([text, selected, action], index) => {
      makeButton(this, x + width / 2 + index * (width + 6), y + 22, text, action, {
        width, height: 38, fontSize: "15px", selected,
      });
    });
  }

  private setTextSize(value: TextSize): void {
    PlayerSettings.set("textSize", value);
    this.render();
  }

  private setTextSpeed(value: TextSpeed): void {
    PlayerSettings.set("textSpeed", value);
    this.render();
  }

  private setBoolean(key: "reducedMotion" | "highContrast", value: boolean): void {
    PlayerSettings.set(key, value);
    this.render();
  }

  private setFullscreen(value: boolean): void {
    void DisplayControl.setFullscreen(value).then((actual) => {
      this.fullscreen = actual;
      if (this.scene.isActive()) this.render();
    });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(SceneKey.MainMenu);
  }
}
