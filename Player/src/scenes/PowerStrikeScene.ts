import Phaser from "phaser";
import { getAssetIndex } from "@/bundle/registry";
import {
  resolveTunable,
  type PowerStrikeMinigame,
} from "@/bundle/spec/bundle/minigameDoc";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import type { GameState } from "@/state/GameState";
import { makeButton } from "@/ui/Button";

export interface PowerStrikeSceneData {
  name: string;
  mode: "story" | "test";
}

interface ResolvedPowerStrike {
  targetDurability: number;
  strikeLimit: number;
  chargeDurationMs: number;
  idealPowerPercent: number;
  perfectWindowPercent: number;
  goodWindowPercent: number;
  perfectDamage: number;
  goodDamage: number;
  weakDamage: number;
  wrongSideDamagePercent: number;
  recoveryMs: number;
}

type Side = -1 | 1;
type Phase = "ready" | "charging" | "recovering" | "resolved";

const BAR_LEFT = 220;
const BAR_WIDTH = GAME_WIDTH - BAR_LEFT * 2;
const POWER_Y = 560;

/**
 * A deliberate charge-and-release challenge: choose the marked side, build a
 * swing, and let it go near the gold band. It rewards committing force rather
 * than the spatial reactions of quick-hands or the continuous balance of the
 * carry.
 */
export class PowerStrikeScene extends Phaser.Scene {
  private state!: GameState;
  private launchData!: PowerStrikeSceneData;
  private gameDef!: PowerStrikeMinigame;
  private config!: ResolvedPowerStrike;

  private phase: Phase = "ready";
  private weakSide: Side = -1;
  private chargingSide: Side = -1;
  private chargeStartedAt = 0;
  private targetLeft = 0;
  private strikesUsed = 0;
  private targetStage = -1;
  private recovery?: Phaser.Time.TimerEvent;
  private finishAction: (() => void) | null = null;

  private meter!: Phaser.GameObjects.Graphics;
  private targetView?: Phaser.GameObjects.Container;
  private toolView!: Phaser.GameObjects.Container;
  private weakMarker!: Phaser.GameObjects.Text;
  private durabilityText!: Phaser.GameObjects.Text;
  private strikesText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private previousButtons = new Array<boolean>(16).fill(false);

  constructor() {
    super(SceneKey.PowerStrike);
  }

  create(data: PowerStrikeSceneData): void {
    this.launchData = data;
    this.state = getGameState(this);
    const found = this.state.bundle.minigames.minigames.find((game) => game.name === data.name);
    if (!found) {
      this.showProblem(`There is no minigame called ${data.name}.`);
      return;
    }
    if (found.kind !== "powerstrike") {
      this.showProblem(`${found.display || found.name} is not a power-strike minigame.`);
      return;
    }
    if (!found.resultVariable) {
      this.showProblem(`${found.display || found.name} needs a result variable.`);
      return;
    }

    this.gameDef = found;
    const read = (name: string): number => this.state.stats.get(name);
    const perfectWindow = resolveTunable(found.perfectWindowPercent, read, 1, 100);
    this.config = {
      targetDurability: resolveTunable(found.targetDurability, read, 1),
      strikeLimit: resolveTunable(found.strikeLimit, read, 1, 50),
      chargeDurationMs: resolveTunable(found.chargeDurationMs, read, 300, 10_000),
      idealPowerPercent: resolveTunable(found.idealPowerPercent, read, 0, 100),
      perfectWindowPercent: perfectWindow,
      goodWindowPercent: Math.max(
        perfectWindow,
        resolveTunable(found.goodWindowPercent, read, 1, 100),
      ),
      perfectDamage: resolveTunable(found.perfectDamage, read, 0),
      goodDamage: resolveTunable(found.goodDamage, read, 0),
      weakDamage: resolveTunable(found.weakDamage, read, 0),
      wrongSideDamagePercent: resolveTunable(found.wrongSideDamagePercent, read, 0, 100),
      recoveryMs: resolveTunable(found.recoveryMs, read, 0, 5_000),
    };

    this.resetRuntime();
    this.resetResult();
    this.cameras.main.setBackgroundColor("#090b12");
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x090b12).setOrigin(0).setDepth(-100);
    this.showBackground();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070c, 0.42).setOrigin(0).setDepth(-80);
    this.add
      .text(GAME_WIDTH / 2, 24, found.display || found.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        color: "#f0e7dc",
      })
      .setOrigin(0.5, 0)
      .setDepth(30);

    this.meter = this.add.graphics().setDepth(20);
    this.durabilityText = this.add
      .text(80, 76, "", { fontFamily: "system-ui, sans-serif", fontSize: "20px", color: "#f0e7dc" })
      .setDepth(30);
    this.strikesText = this.add
      .text(GAME_WIDTH - 80, 76, "", { fontFamily: "system-ui, sans-serif", fontSize: "20px", color: "#f0e7dc" })
      .setOrigin(1, 0)
      .setDepth(30);
    this.weakMarker = this.add
      .text(0, 315, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#f2c85b",
      })
      .setOrigin(0.5)
      .setDepth(32);
    this.status = this.add
      .text(GAME_WIDTH / 2, 620, "", {
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
        "HOLD + RELEASE LEFT / RIGHT CLICK    KEYBOARD: ← → / A D    CONTROLLER: D-PAD / TRIGGERS",
        { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#aeb8d0" },
      )
      .setOrigin(0.5)
      .setDepth(30);

    this.toolView = this.makeTool().setDepth(16);
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.resolvedAction()) return;
      if (pointer.leftButtonDown()) this.beginCharge(-1);
      else if (pointer.rightButtonDown()) this.beginCharge(1);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.releaseStrike());
    this.bindKey("LEFT", -1);
    this.bindKey("A", -1);
    this.bindKey("RIGHT", 1);
    this.bindKey("D", 1);
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (this.phase === "resolved") this.finishAction?.();
    });
    this.input.keyboard?.on("keydown-ENTER", () => {
      if (this.phase === "resolved") this.finishAction?.();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearRecovery());
    this.beginTurn();
  }

  override update(time: number): void {
    this.pollController();
    if (this.phase !== "charging") return;
    const power = this.powerAt(time);
    this.draw(power);
    this.poseTool(power);
    if (power >= 100) this.landStrike(100);
  }

  private bindKey(key: string, side: Side): void {
    this.input.keyboard?.on(`keydown-${key}`, () => this.beginCharge(side));
    this.input.keyboard?.on(`keyup-${key}`, () => {
      if (this.phase === "charging" && this.chargingSide === side) this.releaseStrike();
    });
  }

  private beginTurn(): void {
    if (this.phase === "resolved") return;
    this.phase = "ready";
    this.weakSide = Math.random() < 0.5 ? -1 : 1;
    this.weakMarker
      .setX(GAME_WIDTH / 2 + this.weakSide * 265)
      .setText(this.weakSide === -1 ? "◀ WEAK POINT" : "WEAK POINT ▶");
    this.setHint("Read the weak side. Hold to build power, then release in gold.");
    this.poseTool(0);
    this.draw(0);
  }

  private beginCharge(side: Side): void {
    if (this.phase !== "ready") return;
    this.phase = "charging";
    this.chargingSide = side;
    this.chargeStartedAt = this.time.now;
    this.setHint(side === this.weakSide ? "Build the swing…" : "That is the wrong side…");
  }

  private releaseStrike(): void {
    if (this.phase !== "charging") return;
    this.landStrike(this.powerAt(this.time.now));
  }

  private landStrike(power: number): void {
    if (this.phase !== "charging") return;
    this.phase = "recovering";
    const distance = Math.abs(power - this.config.idealPowerPercent);
    const perfect = distance <= this.config.perfectWindowPercent / 2;
    const good = distance <= this.config.goodWindowPercent / 2 && power < 100;
    let damage = perfect
      ? this.config.perfectDamage
      : good
        ? this.config.goodDamage
        : this.config.weakDamage;
    const correctSide = this.chargingSide === this.weakSide;
    if (!correctSide) damage *= this.config.wrongSideDamagePercent / 100;
    damage = Math.max(0, Math.round(damage));

    this.targetLeft = Math.max(0, this.targetLeft - damage);
    this.strikesUsed += 1;
    this.weakMarker.setText("");
    this.draw(power);
    this.drawTarget();
    this.impactTool();

    const quality = power >= 100 ? "Overextended" : perfect ? "Perfect" : good ? "Solid" : "Weak";
    this.setHint(`${correctSide ? quality : "Wrong side"} — ${damage} damage.`);
    if (this.targetLeft <= 0) {
      this.scheduleRecovery(() => this.resolve("victory"));
    } else if (this.strikesUsed >= this.config.strikeLimit) {
      this.scheduleRecovery(() => this.resolve("defeat"));
    } else {
      this.scheduleRecovery(() => this.beginTurn());
    }
  }

  private resetRuntime(): void {
    this.clearRecovery();
    this.phase = "ready";
    this.targetLeft = this.config.targetDurability;
    this.strikesUsed = 0;
    this.targetStage = -1;
    this.finishAction = null;
    this.previousButtons.fill(false);
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
    if (this.phase === "resolved") return;
    this.phase = "resolved";
    this.clearRecovery();
    try {
      this.state.engine.setVariable(this.gameDef.resultVariable, result);
      this.state.refresh();
    } catch (error) {
      console.error(`Could not set minigame result ${this.gameDef.resultVariable}.`, error);
    }

    this.weakMarker.setText("");
    this.status.setText(
      result === "victory"
        ? `Target broken in ${this.strikesUsed} strikes.`
        : `The target held — ${this.targetLeft} durability remained.`,
    );
    this.status.setY(505);
    this.controlsText.setVisible(false);
    this.toolView.setVisible(false);
    const label = this.launchData.mode === "test" ? "TEST AGAIN" : "RETURN TO STORY";
    this.finishAction =
      this.launchData.mode === "test"
        ? () => this.scene.restart(this.launchData)
        : () => {
            this.scene.resume(SceneKey.VN);
            this.scene.stop();
          };
    makeButton(this, GAME_WIDTH / 2, 635, label, () => this.finishAction?.(), {
      width: 340,
      height: 64,
      fontSize: "22px",
    }).setDepth(60);
  }

  private resolvedAction(): boolean {
    if (this.phase !== "resolved") return false;
    this.finishAction?.();
    return true;
  }

  private powerAt(time: number): number {
    return Phaser.Math.Clamp(
      ((time - this.chargeStartedAt) / this.config.chargeDurationMs) * 100,
      0,
      100,
    );
  }

  private draw(power: number): void {
    const durability = this.targetLeft / this.config.targetDurability;
    const goodLeft = Phaser.Math.Clamp(
      this.config.idealPowerPercent - this.config.goodWindowPercent / 2,
      0,
      100,
    );
    const goodRight = Phaser.Math.Clamp(
      this.config.idealPowerPercent + this.config.goodWindowPercent / 2,
      0,
      100,
    );
    const perfectLeft = Phaser.Math.Clamp(
      this.config.idealPowerPercent - this.config.perfectWindowPercent / 2,
      0,
      100,
    );
    const perfectRight = Phaser.Math.Clamp(
      this.config.idealPowerPercent + this.config.perfectWindowPercent / 2,
      0,
      100,
    );

    this.meter.clear();
    this.bar(80, 110, GAME_WIDTH - 160, durability, 0x79d891);
    this.meter.fillStyle(0x242938, 1).fillRoundedRect(BAR_LEFT, POWER_Y, BAR_WIDTH, 28, 8);
    if (power > 0) {
      this.meter
        .fillStyle(power >= 100 ? 0xe07478 : 0xdbe4f4, 0.7)
        .fillRoundedRect(BAR_LEFT, POWER_Y, Math.max(10, (power / 100) * BAR_WIDTH), 28, 8);
    }
    this.meter
      .fillStyle(0xbc4b51, 0.35)
      .fillRect(BAR_LEFT + (goodRight / 100) * BAR_WIDTH, POWER_Y, ((100 - goodRight) / 100) * BAR_WIDTH, 28);
    this.meter
      .fillStyle(0xb88943, 0.65)
      .fillRect(BAR_LEFT + (goodLeft / 100) * BAR_WIDTH, POWER_Y, ((goodRight - goodLeft) / 100) * BAR_WIDTH, 28);
    this.meter
      .fillStyle(0xf2c85b, 1)
      .fillRect(BAR_LEFT + (perfectLeft / 100) * BAR_WIDTH, POWER_Y, ((perfectRight - perfectLeft) / 100) * BAR_WIDTH, 28);
    this.durabilityText.setText(`Target ${this.targetLeft}/${this.config.targetDurability}`);
    this.strikesText.setText(`Strikes ${this.config.strikeLimit - this.strikesUsed}`);
    this.drawTarget();
  }

  private bar(x: number, y: number, width: number, ratio: number, colour: number): void {
    this.meter.fillStyle(0x242938, 1).fillRoundedRect(x, y, width, 18, 7);
    if (ratio > 0) {
      this.meter
        .fillStyle(colour, 1)
        .fillRoundedRect(x, y, Math.max(10, width * Phaser.Math.Clamp(ratio, 0, 1)), 18, 7);
    }
  }

  private drawTarget(): void {
    const progress = 1 - this.targetLeft / this.config.targetDurability;
    const count = this.gameDef.targetArt.length;
    const stage = count > 0 ? Math.min(count - 1, Math.floor(progress * count)) : Math.floor(progress * 4);
    if (stage === this.targetStage) return;
    this.targetStage = stage;
    this.targetView?.destroy(true);

    const children: Phaser.GameObjects.GameObject[] = [];
    const ref = count > 0 ? this.gameDef.targetArt[stage] ?? this.gameDef.targetArt[count - 1] : null;
    const resolved = ref ? getAssetIndex(this).resolveRef(ref) : null;
    if (resolved && !isVideoFile(resolved.path)) {
      const image = this.add.image(0, 0, resolved.key);
      image.setScale(Math.min(390 / Math.max(image.width, 1), 320 / Math.max(image.height, 1)));
      children.push(image);
    } else {
      const log = this.add.graphics();
      log.fillStyle(0x7d4f2c, 1).fillRoundedRect(-150, -95, 300, 190, 72);
      log.lineStyle(8, 0xb9824e, 1).strokeEllipse(0, 0, 270, 160);
      log.lineStyle(4, 0x3e2718, 1);
      if (stage >= 1) log.lineBetween(-25, -70, 5, -10);
      if (stage >= 2) log.lineBetween(5, -10, -35, 65);
      if (stage >= 3) {
        log.lineBetween(5, -10, 48, 58);
        log.lineBetween(5, -10, 55, -60);
      }
      children.push(log);
    }
    this.targetView = this.add.container(GAME_WIDTH / 2, 325, children).setDepth(10);
  }

  private makeTool(): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = [];
    const resolved = this.gameDef.toolArt
      ? getAssetIndex(this).resolveRef(this.gameDef.toolArt)
      : null;
    if (resolved && !isVideoFile(resolved.path)) {
      const image = this.add.image(0, 0, resolved.key);
      image.setScale(Math.min(210 / Math.max(image.width, 1), 210 / Math.max(image.height, 1)));
      children.push(image);
    } else {
      const maul = this.add.graphics();
      maul.fillStyle(0x9c6b3c, 1).fillRoundedRect(-10, -15, 190, 30, 8);
      maul.fillStyle(0x4e5667, 1).fillRoundedRect(-65, -42, 85, 84, 10);
      children.push(maul);
    }
    return this.add.container(GAME_WIDTH / 2 - 300, 300, children);
  }

  private poseTool(power: number): void {
    const side = this.phase === "charging" ? this.chargingSide : this.weakSide;
    this.toolView.setVisible(true);
    this.toolView.setScale(side === -1 ? 1 : -1, 1);
    this.toolView.x = GAME_WIDTH / 2 + side * (300 + power * 1.2);
    this.toolView.y = 300 - power * 1.2;
    this.toolView.setAngle(side * (-18 - power * 0.45));
  }

  private impactTool(): void {
    this.tweens.killTweensOf(this.toolView);
    this.toolView.x = GAME_WIDTH / 2 + this.chargingSide * 145;
    this.toolView.y = 260;
    this.toolView.setAngle(this.chargingSide * 8);
    this.cameras.main.shake(100, 0.004);
  }

  private setHint(message: string): void {
    this.status.setText(this.gameDef.showStateHints ? message : "");
  }

  private showBackground(): void {
    if (!this.gameDef.background) return;
    const resolved = getAssetIndex(this).resolveRef(this.gameDef.background);
    if (!resolved || resolved.kind !== "background" || isVideoFile(resolved.path)) {
      console.warn(`Could not display the power-strike background for ${this.gameDef.name}.`);
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

  private scheduleRecovery(action: () => void): void {
    this.clearRecovery();
    this.recovery = this.time.delayedCall(this.config.recoveryMs, action);
  }

  private clearRecovery(): void {
    if (!this.recovery) return;
    this.time.removeEvent(this.recovery);
    this.recovery = undefined;
  }

  private pollController(): void {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((one): one is Gamepad => one !== null);
    if (!pad) return;
    const left = this.button(pad, 6) || this.button(pad, 14);
    const right = this.button(pad, 7) || this.button(pad, 15);
    if (this.phase === "resolved" && this.pressed(pad, 0)) this.finishAction?.();
    if (this.phase === "ready") {
      if (left && !this.wasPressed(6, 14)) this.beginCharge(-1);
      else if (right && !this.wasPressed(7, 15)) this.beginCharge(1);
    } else if (this.phase === "charging") {
      const held = this.chargingSide === -1 ? left : right;
      if (!held) this.releaseStrike();
    }
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

  private wasPressed(first: number, second: number): boolean {
    return (this.previousButtons[first] ?? false) || (this.previousButtons[second] ?? false);
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
