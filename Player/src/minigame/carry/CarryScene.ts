import Phaser from "phaser";
import { getAssetIndex } from "@/bundle/registry";
import {
  resolveTunable,
  type CarryMinigame,
} from "@/bundle/spec/bundle/minigameDoc";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import type { GameState } from "@/state/GameState";
import { makeButton } from "@/ui/Button";

/**
 * Carrying a load across a yard without dropping it.
 *
 * Conditioning rather than a fight: the load leans on its own and is corrected
 * left or right, and holding it off-centre costs stamina faster than holding it
 * straight. Reach the far wall with stamina left and the carry is made.
 *
 * The stamina bar lives here and nowhere else. Combat writes its damage into a
 * bound ink variable because that damage is meant to persist; a training
 * exercise that left the player worse off than when they started would be
 * absurd, so this keeps its bar the way quick-hands keeps its score — only the
 * outcome reaches the story.
 */

/** Where the load rides, and how far it swings on screen at full tilt. */
const LOAD_Y = 330;
const LOAD_SWING_PX = 300;
const LOAD_SWING_DEGREES = 34;

/** The bars: distance under the title, stamina above the controls. */
const TRACK_Y = 140;
const STAMINA_Y = 560;
const BAR_LEFT = 220;
const BAR_WIDTH = GAME_WIDTH - BAR_LEFT * 2;

/** How long the load holds a lean before it may change its mind, in ms. */
const DRIFT_HOLD_MS = 1_400;

export interface CarrySceneData {
  name: string;
  mode: "story" | "test";
}

interface ResolvedCarry {
  distanceMs: number;
  staminaMax: number;
  staminaDrainPerSecond: number;
  wobbleDriftPerSecond: number;
  wobbleLimit: number;
  correctionStrength: number;
  tiltDrainMultiplier: number;
}

export class CarryScene extends Phaser.Scene {
  private state!: GameState;
  private launchData!: CarrySceneData;
  private gameDef!: CarryMinigame;
  private config!: ResolvedCarry;

  /** Signed lean, in the same units as `wobbleLimit`. Zero is upright. */
  private tilt = 0;
  /** Which way the load is leaning of its own accord, and until when. */
  private driftDirection: -1 | 1 = 1;
  private driftUntil = 0;
  private stamina = 0;
  private walkedMs = 0;
  private resolved = false;
  private finishAction: (() => void) | null = null;

  private bars!: Phaser.GameObjects.Graphics;
  private loadView!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private previousButtons = new Array<boolean>(16).fill(false);
  private previousAxis = 0;

  constructor() {
    super('Carry');
  }

  create(data: CarrySceneData): void {
    this.launchData = data;
    this.state = getGameState(this);
    const found = this.state.bundle.minigames.minigames.find((game) => game.name === data.name);
    if (!found) {
      this.showProblem(`There is no minigame called ${data.name}.`);
      return;
    }
    if (found.kind !== "carry") {
      this.showProblem(`${found.display || found.name} is not a carry minigame.`);
      return;
    }
    if (!found.resultVariable) {
      this.showProblem(`${found.display || found.name} needs a result variable.`);
      return;
    }

    this.gameDef = found;
    const read = (name: string): number => this.state.stats.get(name);
    this.config = {
      distanceMs: resolveTunable(found.distanceMs, read, 3_000, 180_000),
      staminaMax: resolveTunable(found.staminaMax, read, 1),
      staminaDrainPerSecond: resolveTunable(found.staminaDrainPerSecond, read, 0),
      wobbleDriftPerSecond: resolveTunable(found.wobbleDriftPerSecond, read, 0),
      wobbleLimit: resolveTunable(found.wobbleLimit, read, 1),
      correctionStrength: resolveTunable(found.correctionStrength, read, 0),
      tiltDrainMultiplier: resolveTunable(found.tiltDrainMultiplier, read, 0),
    };

    this.resetRuntime();
    this.resetResult();

    this.cameras.main.setBackgroundColor("#090b12");
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x090b12).setOrigin(0).setDepth(-100);
    this.showBackground();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070c, 0.4).setOrigin(0).setDepth(-80);
    this.add
      .text(GAME_WIDTH / 2, 24, found.display || found.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        color: "#f0e7dc",
      })
      .setOrigin(0.5, 0)
      .setDepth(30);

    this.bars = this.add.graphics().setDepth(20);
    this.loadView = this.makeLoad().setDepth(18);
    this.status = this.add
      .text(GAME_WIDTH / 2, 620, found.showStateHints ? "Keep the load level. Lean costs strength." : "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f0e7dc",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.controlsText = this.add
      .text(
        GAME_WIDTH / 2,
        680,
        "MOUSE: CLICK LEFT / RIGHT SIDE    KEYBOARD: LEFT RIGHT / A D    CONTROLLER: STICK / D-PAD",
        { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#aeb8d0" },
      )
      .setOrigin(0.5)
      .setDepth(30);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (this.resolved) this.finishAction?.();
      else this.correct(pointer.x < GAME_WIDTH / 2 ? -1 : 1);
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.correct(-1));
    this.input.keyboard?.on("keydown-A", () => this.correct(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.correct(1));
    this.input.keyboard?.on("keydown-D", () => this.correct(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.finishAction?.());
    this.input.keyboard?.on("keydown-ENTER", () => this.finishAction?.());

    this.draw();
  }

  override update(time: number, delta: number): void {
    if (this.resolved || !this.gameDef) return;
    this.pollController();

    // The lean holds a direction for a beat before it may change, so the load
    // can be answered rather than merely twitched at.
    if (time >= this.driftUntil) {
      this.driftDirection = Math.random() < 0.5 ? -1 : 1;
      this.driftUntil = time + DRIFT_HOLD_MS;
    }

    const seconds = delta / 1000;
    this.tilt += this.driftDirection * this.config.wobbleDriftPerSecond * seconds;

    // Off-centre is the whole cost of the exercise: at the dropping point the
    // drain is the base rate times the multiplier, and dead level is the base.
    const lean = Math.min(1, Math.abs(this.tilt) / this.config.wobbleLimit);
    this.stamina -=
      this.config.staminaDrainPerSecond * (1 + this.config.tiltDrainMultiplier * lean) * seconds;
    this.walkedMs += delta;
    this.draw();

    if (Math.abs(this.tilt) >= this.config.wobbleLimit) {
      this.setHint("The load went over.");
      this.resolve("defeat");
      return;
    }
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.setHint("His arms gave out.");
      this.resolve("defeat");
      return;
    }
    if (this.walkedMs >= this.config.distanceMs) this.resolve("victory");
  }

  private correct(direction: -1 | 1): void {
    if (this.resolved) return;
    this.tilt += direction * this.config.correctionStrength;
    this.draw();
  }

  private draw(): void {
    const walked = Math.min(1, this.walkedMs / Math.max(1, this.config.distanceMs));
    const left = Math.max(0, this.stamina) / this.config.staminaMax;
    const lean = Phaser.Math.Clamp(this.tilt / this.config.wobbleLimit, -1, 1);

    this.bars.clear();
    this.bar(TRACK_Y, walked, 0xf2c85b);
    this.bar(STAMINA_Y, left, left > 0.35 ? 0x79d891 : 0xe07478);

    this.loadView.x = GAME_WIDTH / 2 + lean * LOAD_SWING_PX;
    this.loadView.setAngle(lean * LOAD_SWING_DEGREES);
  }

  private bar(y: number, filled: number, colour: number): void {
    this.bars.fillStyle(0x1b2233, 1).fillRoundedRect(BAR_LEFT, y, BAR_WIDTH, 18, 9);
    if (filled > 0) {
      this.bars
        .fillStyle(colour, 1)
        .fillRoundedRect(BAR_LEFT, y, Math.max(12, BAR_WIDTH * filled), 18, 9);
    }
  }

  /** The load, from the authored look or a readable shape when there is none. */
  private makeLoad(): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = [];
    const resolved = this.gameDef.loadArt
      ? getAssetIndex(this).resolveRef(this.gameDef.loadArt)
      : null;
    if (resolved && !isVideoFile(resolved.path)) {
      const image = this.add.image(0, 0, resolved.key);
      image.setScale(Math.min(200 / Math.max(image.width, 1), 200 / Math.max(image.height, 1)));
      children.push(image);
    } else {
      const graphic = this.add.graphics();
      graphic.fillStyle(0xc2a26a, 1).fillRoundedRect(-120, -18, 240, 36, 10);
      graphic.fillStyle(0x8a6f45, 1).fillCircle(-120, 0, 26).fillCircle(120, 0, 26);
      children.push(graphic);
    }
    return this.add.container(GAME_WIDTH / 2, LOAD_Y, children);
  }

  private setHint(message: string): void {
    if (this.gameDef.showStateHints) this.status.setText(message);
  }

  private resetRuntime(): void {
    this.tilt = 0;
    this.stamina = this.config.staminaMax;
    this.walkedMs = 0;
    this.driftUntil = 0;
    this.resolved = false;
    this.finishAction = null;
    this.previousButtons.fill(false);
    this.previousAxis = 0;
  }

  private resetResult(): void {
    try {
      this.state.engine.setVariable(this.gameDef.resultVariable, "");
      this.state.refresh();
    } catch (error) {
      console.error(`Could not reset minigame result ${this.gameDef.resultVariable}.`, error);
    }
  }

  private resolve(result: "victory" | "defeat"): void {
    if (this.resolved) return;
    this.resolved = true;
    try {
      this.state.engine.setVariable(this.gameDef.resultVariable, result);
      this.state.refresh();
    } catch (error) {
      console.error(`Could not set minigame result ${this.gameDef.resultVariable}.`, error);
    }

    const walked = Math.round((Math.min(this.walkedMs, this.config.distanceMs) / 1000) * 10) / 10;
    this.status.setText(
      result === "victory" ? `Carried the full distance — ${walked}s` : `Dropped it at ${walked}s`,
    );
    this.loadView.setVisible(false);
    this.status.setY(500);
    this.controlsText.setVisible(false);
    const label = this.launchData.mode === "test" ? "TEST AGAIN" : "RETURN TO STORY";
    this.finishAction =
      this.launchData.mode === "test"
        ? () => this.scene.restart(this.launchData)
        : () => {
            this.scene.resume(SceneKey.VN);
            this.scene.stop();
          };
    makeButton(this, GAME_WIDTH / 2, 620, label, () => this.finishAction?.(), {
      width: 340,
      height: 60,
      fontSize: "22px",
    }).setDepth(60);
  }

  private showBackground(): void {
    if (!this.gameDef.background) return;
    const resolved = getAssetIndex(this).resolveRef(this.gameDef.background);
    if (!resolved || resolved.kind !== "background" || isVideoFile(resolved.path)) {
      console.warn(`Could not display the carry background for ${this.gameDef.name}.`);
      return;
    }
    const background = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, resolved.key).setDepth(-90);
    background.setScale(
      Math.max(
        GAME_WIDTH / Math.max(background.width, 1),
        GAME_HEIGHT / Math.max(background.height, 1),
      ),
    );
  }

  private pollController(): void {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((one): one is Gamepad => one !== null);
    if (!pad) return;
    const axis = pad.axes[0] ?? 0;
    const direction =
      this.button(pad, 14) || axis < -0.55 ? -1 : this.button(pad, 15) || axis > 0.55 ? 1 : 0;
    if (direction !== 0 && this.previousAxis === 0) this.correct(direction);
    this.previousAxis = direction;
    if (this.pressed(pad, 0)) this.finishAction?.();
    for (let index = 0; index < this.previousButtons.length; index += 1) {
      this.previousButtons[index] = this.button(pad, index);
    }
  }

  private button(pad: Gamepad, index: number): boolean {
    return pad.buttons[index]?.pressed ?? false;
  }

  private pressed(pad: Gamepad, index: number): boolean {
    return this.button(pad, index) && !this.previousButtons[index];
  }

  private showProblem(message: string): void {
    this.cameras.main.setBackgroundColor("#090b12");
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, message, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "25px",
        color: "#f0b7b7",
        align: "center",
        wordWrap: { width: 820 },
      })
      .setOrigin(0.5);
    makeButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, "RETURN", () => {
      if (this.launchData.mode === "story") this.scene.resume(SceneKey.VN);
      this.scene.stop();
    });
  }
}
