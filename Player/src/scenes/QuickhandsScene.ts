import Phaser from "phaser";
import { getAssetIndex } from "@/bundle/registry";
import type { GalleryMediaRef } from "@/bundle/spec/bundle/galleryDoc";
import {
  resolveTunable,
  type QuickhandsMinigame,
} from "@/bundle/spec/bundle/minigameDoc";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import type { GameState } from "@/state/GameState";
import { makeButton } from "@/ui/Button";

/** One of the authored looks, or null when the cabinet has none to draw with. */
function pickOne(looks: GalleryMediaRef[]): GalleryMediaRef | null {
  return looks.length === 0 ? null : looks[Math.floor(Math.random() * looks.length)]!;
}

export interface QuickhandsSceneData {
  name: string;
  mode: "story" | "test";
}

interface ResolvedQuickhands {
  laneCount: number;
  roundDurationMs: number;
  spawnIntervalMs: number;
  fallDurationMs: number;
  catchWindowMs: number;
  targetChancePercent: number;
  goalScore: number;
  targetPoints: number;
  hazardPenalty: number;
  missedTargetPenalty: number;
}

interface FallingObject {
  lane: number;
  target: boolean;
  bornAt: number;
  view: Phaser.GameObjects.Container;
}

const PLAY_TOP = 120;
const CATCH_Y = 570;
const LANE_LEFT = 220;
const LANE_RIGHT = GAME_WIDTH - 220;

/**
 * A short lane-and-timing challenge with input parity by construction: every
 * device selects one discrete lane and performs the same catch action.
 */
export class QuickhandsScene extends Phaser.Scene {
  private state!: GameState;
  private launchData!: QuickhandsSceneData;
  private gameDef!: QuickhandsMinigame;
  private config!: ResolvedQuickhands;
  private objects: FallingObject[] = [];
  private selectedLane = 0;
  private score = 0;
  /**
   * The look each kind wears for this round, drawn once from the authored set.
   *
   * A lane full of identical tokens reads as a test pattern, so a cabinet may
   * carry several looks and shows one of them per round. Chosen at the start
   * rather than per object, so a round is visually consistent and the same
   * cabinet still differs twice running.
   */
  private roundTargetArt: GalleryMediaRef | null = null;
  private roundHazardArt: GalleryMediaRef | null = null;
  private endsAt = 0;
  private nextSpawnAt = 0;
  private resolved = false;
  private finishAction: (() => void) | null = null;
  private laneGraphics!: Phaser.GameObjects.Graphics;
  private catcher!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private previousButtons = new Array<boolean>(16).fill(false);
  private previousAxis = 0;
  /**
   * Where the pointer was when it last claimed a lane, or null if never.
   *
   * A mouse gets its say by *moving*, not by sitting somewhere. Without this the
   * cursor's resting position silently overruled every key press and pad nudge:
   * Phaser reports a move for one pixel of hand tremor, so a player who stepped
   * right with the arrow keys was snapped back to whatever lane the cursor
   * happened to be over — almost always the middle one, since that is where the
   * click that started the game left the cursor.
   */
  private pointerClaimedX: number | null = null;

  constructor() {
    super(SceneKey.Quickhands);
  }

  create(data: QuickhandsSceneData): void {
    this.launchData = data;
    this.state = getGameState(this);
    const found = this.state.bundle.minigames.minigames.find((game) => game.name === data.name);
    if (!found) {
      this.showProblem(`There is no minigame called ${data.name}.`);
      return;
    }
    if (found.kind !== "quickhands") {
      this.showProblem(`${found.display || found.name} is not a quick-hands minigame.`);
      return;
    }
    if (!found.resultVariable) {
      this.showProblem(`${found.display || found.name} needs a result variable.`);
      return;
    }

    this.gameDef = found;
    this.resetRuntime();
    this.resetResult();
    const read = (name: string): number => this.state.stats.get(name);
    this.config = {
      laneCount: resolveTunable(found.laneCount, read, 2, 5),
      roundDurationMs: resolveTunable(found.roundDurationMs, read, 3_000, 180_000),
      spawnIntervalMs: resolveTunable(found.spawnIntervalMs, read, 150, 10_000),
      fallDurationMs: resolveTunable(found.fallDurationMs, read, 600, 20_000),
      catchWindowMs: resolveTunable(found.catchWindowMs, read, 80, 5_000),
      targetChancePercent: resolveTunable(found.targetChancePercent, read, 0, 100),
      goalScore: resolveTunable(found.goalScore, read, 0),
      targetPoints: resolveTunable(found.targetPoints, read, 0),
      hazardPenalty: resolveTunable(found.hazardPenalty, read, 0),
      missedTargetPenalty: resolveTunable(found.missedTargetPenalty, read, 0),
    };
    this.selectedLane = Math.floor(this.config.laneCount / 2);

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

    this.laneGraphics = this.add.graphics().setDepth(0);
    this.drawLanes();
    this.catcher = this.makeArt(found.catcherArt, "catcher").setDepth(18);
    this.positionCatcher();
    this.scoreText = this.add
      .text(70, 70, "", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#f0e7dc" })
      .setDepth(30);
    this.timeText = this.add
      .text(GAME_WIDTH - 70, 70, "", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#f0e7dc" })
      .setOrigin(1, 0)
      .setDepth(30);
    this.status = this.add
      .text(GAME_WIDTH / 2, 620, found.showStateHints ? "Catch valuables. Let hazards fall." : "", {
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
        "MOUSE: POINT + CLICK    KEYBOARD: ← → / A D + SPACE    CONTROLLER: STICK / D-PAD + A",
        { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#aeb8d0" },
      )
      .setOrigin(0.5)
      .setDepth(30);

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.resolved || !this.pointerMoved(pointer.x)) return;
      this.selectLane(this.laneAt(pointer.x));
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      // A catch happens in the lane the catcher is *in* — the one the player can
      // see. Re-aiming from the cursor here was the resting-position fault by
      // another route: a click to catch after a key press dragged the catcher
      // back under the mouse and caught in the wrong lane. Pointing is the
      // mouse's way of aiming, and it has already happened by now.
      if (this.resolved) this.finishAction?.();
      else this.catchObject();
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.moveLane(-1));
    this.input.keyboard?.on("keydown-A", () => this.moveLane(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.moveLane(1));
    this.input.keyboard?.on("keydown-D", () => this.moveLane(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.act());
    this.input.keyboard?.on("keydown-ENTER", () => this.act());

    this.endsAt = this.time.now + this.config.roundDurationMs;
    this.nextSpawnAt = this.time.now + Math.min(500, this.config.spawnIntervalMs);
    this.drawScore();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearObjects());
  }

  override update(time: number): void {
    this.pollController();
    if (this.resolved || !this.gameDef) return;

    while (time >= this.nextSpawnAt && this.nextSpawnAt < this.endsAt) {
      this.spawn(this.nextSpawnAt);
      this.nextSpawnAt += this.config.spawnIntervalMs;
    }

    for (const object of [...this.objects]) {
      const progress = (time - object.bornAt) / this.config.fallDurationMs;
      object.view.y = Phaser.Math.Linear(PLAY_TOP, CATCH_Y + 80, progress);
      if (progress >= 1) this.miss(object);
    }

    const remaining = Math.max(0, this.endsAt - time);
    this.timeText.setText(`${Math.ceil(remaining / 1000)}s`);
    if (remaining === 0) this.resolve(this.score >= this.config.goalScore ? "victory" : "defeat");
  }

  private resetRuntime(): void {
    this.clearObjects();
    this.score = 0;
    this.roundTargetArt = pickOne(this.gameDef.targetArt);
    this.roundHazardArt = pickOne(this.gameDef.hazardArt);
    this.resolved = false;
    this.finishAction = null;
    this.previousButtons.fill(false);
    this.previousAxis = 0;
    this.pointerClaimedX = null;
  }

  private resetResult(): void {
    try {
      this.state.engine.setVariable(this.gameDef.resultVariable, "");
      this.state.refresh();
    } catch (error) {
      console.error(`Could not reset minigame result ${this.gameDef.resultVariable}.`, error);
    }
  }

  private spawn(bornAt: number): void {
    const lane = Math.floor(Math.random() * this.config.laneCount);
    const target = Math.random() * 100 < this.config.targetChancePercent;
    const view = this.makeArt(target ? this.roundTargetArt : this.roundHazardArt, target ? "target" : "hazard");
    view.x = this.laneX(lane);
    view.y = PLAY_TOP;
    view.setDepth(10);
    this.objects.push({ lane, target, bornAt, view });
  }

  private catchObject(): void {
    const now = this.time.now;
    const candidate = this.objects
      .filter((object) => object.lane === this.selectedLane)
      .map((object) => ({ object, distance: Math.abs(this.catchTime(object) - now) }))
      .filter(({ distance }) => distance <= this.config.catchWindowMs)
      .sort((a, b) => a.distance - b.distance)[0]?.object;

    if (!candidate) {
      this.setHint("Nothing in reach.");
      this.pulseCatcher(0xbc4b51);
      return;
    }

    this.removeObject(candidate);
    if (candidate.target) {
      this.score += this.config.targetPoints;
      this.setHint(`Caught +${this.config.targetPoints}`);
      this.pulseCatcher(0x79d891);
    } else {
      this.score = Math.max(0, this.score - this.config.hazardPenalty);
      this.setHint(`Hazard −${this.config.hazardPenalty}`);
      this.pulseCatcher(0xe07478);
    }
    this.drawScore();
  }

  private miss(object: FallingObject): void {
    this.removeObject(object);
    if (!object.target) return;
    this.score = Math.max(0, this.score - this.config.missedTargetPenalty);
    this.setHint(`Missed −${this.config.missedTargetPenalty}`);
    this.drawScore();
  }

  private resolve(result: "victory" | "defeat"): void {
    if (this.resolved) return;
    this.resolved = true;
    this.clearObjects();
    try {
      this.state.engine.setVariable(this.gameDef.resultVariable, result);
      this.state.refresh();
    } catch (error) {
      console.error(`Could not set minigame result ${this.gameDef.resultVariable}.`, error);
    }
    this.status.setText(
      result === "victory"
        ? `Quick hands — ${this.score}/${this.config.goalScore}`
        : `Finished — ${this.score}/${this.config.goalScore}`,
    );
    this.catcher.setVisible(false);
    this.status.setY(530);
    this.controlsText.setVisible(false);
    const label = this.launchData.mode === "test" ? "TEST AGAIN" : "RETURN TO STORY";
    this.finishAction = this.launchData.mode === "test"
      ? () => this.scene.restart(this.launchData)
      : () => {
          this.scene.resume(SceneKey.VN);
          this.scene.stop();
        };
    makeButton(this, GAME_WIDTH / 2, 650, label, () => this.finishAction?.(), {
      width: 340,
      height: 60,
      fontSize: "22px",
    }).setDepth(60);
  }

  private act(): void {
    if (this.resolved) this.finishAction?.();
    else this.catchObject();
  }

  private moveLane(direction: -1 | 1): void {
    if (this.resolved) return;
    this.selectLane(Phaser.Math.Clamp(this.selectedLane + direction, 0, this.config.laneCount - 1));
  }

  private selectLane(lane: number): void {
    const next = Phaser.Math.Clamp(lane, 0, this.config.laneCount - 1);
    if (next === this.selectedLane) return;
    this.selectedLane = next;
    this.positionCatcher();
    this.drawLanes();
  }

  /**
   * Has the pointer travelled far enough to mean it?
   *
   * Measured from where the mouse last had its way, so tremor is judged against
   * the position it was honoured at rather than against the previous event. The
   * gate is a third of the gap between lanes, which is deliberately less than
   * the half a lane a cursor has to cross before `laneAt` gives a different
   * answer: it can never swallow a mouse movement that would have changed lane,
   * only one that would not have.
   */
  private pointerMoved(x: number): boolean {
    if (this.pointerClaimedX !== null && Math.abs(x - this.pointerClaimedX) < this.laneInterval() / 3) {
      return false;
    }
    this.pointerClaimedX = x;
    return true;
  }

  private laneInterval(): number {
    return (LANE_RIGHT - LANE_LEFT) / Math.max(1, this.config.laneCount - 1);
  }

  private laneAt(x: number): number {
    return Math.round((x - LANE_LEFT) / this.laneInterval());
  }

  private laneX(lane: number): number {
    if (this.config.laneCount === 1) return GAME_WIDTH / 2;
    return Phaser.Math.Linear(LANE_LEFT, LANE_RIGHT, lane / (this.config.laneCount - 1));
  }

  private catchTime(object: FallingObject): number {
    const progress = (CATCH_Y - PLAY_TOP) / (CATCH_Y + 80 - PLAY_TOP);
    return object.bornAt + this.config.fallDurationMs * progress;
  }

  private positionCatcher(): void {
    this.catcher.x = this.laneX(this.selectedLane);
    this.catcher.y = CATCH_Y;
  }

  private drawLanes(): void {
    this.laneGraphics.clear();
    for (let lane = 0; lane < this.config.laneCount; lane += 1) {
      const x = this.laneX(lane);
      this.laneGraphics.lineStyle(lane === this.selectedLane ? 4 : 2, lane === this.selectedLane ? 0xffd98a : 0x65708a, lane === this.selectedLane ? 0.8 : 0.35);
      this.laneGraphics.lineBetween(x, PLAY_TOP - 5, x, CATCH_Y + 30);
    }
    this.laneGraphics.lineStyle(3, 0xd6c27a, 0.9);
    this.laneGraphics.lineBetween(LANE_LEFT - 80, CATCH_Y, LANE_RIGHT + 80, CATCH_Y);
  }

  private drawScore(): void {
    this.scoreText.setText(`Score ${this.score} / ${this.config.goalScore}`);
  }

  private setHint(message: string): void {
    if (this.gameDef.showStateHints) this.status.setText(message);
  }

  private pulseCatcher(colour: number): void {
    this.tweens.killTweensOf(this.catcher);
    this.catcher.setScale(1).setAlpha(1);
    this.catcher.each((child: Phaser.GameObjects.GameObject) => {
      if ("setTint" in child && typeof child.setTint === "function") child.setTint(colour);
    });
    this.tweens.add({
      targets: this.catcher,
      scale: 1.18,
      duration: 90,
      yoyo: true,
      onComplete: () => {
        this.catcher.each((child: Phaser.GameObjects.GameObject) => {
          if ("clearTint" in child && typeof child.clearTint === "function") child.clearTint();
        });
      },
    });
  }

  private makeArt(ref: GalleryMediaRef | null, fallback: "target" | "hazard" | "catcher"): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = [];
    const resolved = ref ? getAssetIndex(this).resolveRef(ref) : null;
    if (resolved && !isVideoFile(resolved.path)) {
      const image = this.add.image(0, 0, resolved.key);
      image.setScale(Math.min(84 / Math.max(image.width, 1), 84 / Math.max(image.height, 1)));
      children.push(image);
    } else {
      const graphic = this.add.graphics();
      if (fallback === "target") {
        graphic.fillStyle(0xf2c85b, 1).fillCircle(0, 0, 30);
        graphic.lineStyle(4, 0xffefad, 1).strokeCircle(0, 0, 30);
      } else if (fallback === "hazard") {
        graphic.fillStyle(0xa92f45, 1).fillTriangle(0, -36, 34, 28, -34, 28);
        graphic.lineStyle(4, 0xff8c98, 1).strokeTriangle(0, -36, 34, 28, -34, 28);
      } else {
        graphic.fillStyle(0x4f8dd6, 1).fillRoundedRect(-50, -18, 100, 36, 14);
        graphic.lineStyle(4, 0xb9d0ff, 1).strokeRoundedRect(-50, -18, 100, 36, 14);
      }
      children.push(graphic);
    }
    return this.add.container(0, 0, children);
  }

  private removeObject(object: FallingObject): void {
    this.objects = this.objects.filter((candidate) => candidate !== object);
    object.view.destroy(true);
  }

  private clearObjects(): void {
    for (const object of this.objects) object.view.destroy(true);
    this.objects = [];
  }

  private showBackground(): void {
    if (!this.gameDef.background) return;
    const resolved = getAssetIndex(this).resolveRef(this.gameDef.background);
    if (!resolved || resolved.kind !== "background" || isVideoFile(resolved.path)) {
      console.warn(`Could not display the quick-hands background for ${this.gameDef.name}.`);
      return;
    }
    const background = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, resolved.key).setDepth(-90);
    background.setScale(Math.max(
      GAME_WIDTH / Math.max(background.width, 1),
      GAME_HEIGHT / Math.max(background.height, 1),
    ));
  }

  private pollController(): void {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((one): one is Gamepad => one !== null);
    if (!pad) return;
    const axis = pad.axes[0] ?? 0;
    const direction = this.button(pad, 14) || axis < -0.55 ? -1 : this.button(pad, 15) || axis > 0.55 ? 1 : 0;
    if (direction !== 0 && this.previousAxis === 0) this.moveLane(direction);
    this.previousAxis = direction;
    if (this.pressed(pad, 0)) this.act();
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
