import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { getAssetIndex } from "@/bundle/registry";
import { getGameState } from "@/state/registry";
import type { GameState } from "@/state/GameState";
import {
  resolveTunable,
  type CombatMinigame,
  type CombatantState,
} from "@/bundle/spec/bundle/minigameDoc";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { makeButton } from "@/ui/Button";

export interface CombatSceneData {
  name: string;
  mode: "story" | "test";
}

type Side = "left" | "right";
type Phase = "idle" | "prep" | "strike" | "counter" | "resolved";

interface ResolvedCombat {
  opponentHealth: number;
  incomingDamage: number;
  counterDamage: number;
  prepWindowMs: number;
  counterWindowMs: number;
  counterChancePercent: number;
  idleMs: number;
  strikeMs: number;
}

/**
 * A deliberately small timing fight: read the telegraph, parry the matching
 * side, then take the short counter opening. It owns input while VN is paused,
 * and writes only ordinary Ink variables, so its outcome saves with the story.
 */
export class CombatScene extends Phaser.Scene {
  private state!: GameState;
  private launchData!: CombatSceneData;
  private gameDef!: CombatMinigame;
  private config!: ResolvedCombat;
  private playerMax = 1;
  private phase: Phase = "idle";
  private side: Side = "left";
  private opponentHealth = 0;
  private testStart: { name: string; playerHealth: number } | null = null;
  private art?: Phaser.GameObjects.Image;
  private timer?: Phaser.Time.TimerEvent;
  private status!: Phaser.GameObjects.Text;
  private health!: Phaser.GameObjects.Graphics;
  private playerHealthLabel!: Phaser.GameObjects.Text;
  private opponentHealthLabel!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Combat);
  }

  create(data: CombatSceneData): void {
    this.launchData = data;
    this.state = getGameState(this);
    const found = this.state.bundle.minigames.minigames.find((game) => game.name === data.name);
    if (!found) {
      this.showProblem(`There is no minigame called ${data.name}.`);
      return;
    }
    if (found.kind !== "combat") {
      this.showProblem(`${found.display || found.name} is not a combat minigame.`);
      return;
    }
    this.gameDef = found;
    if (!found.playerHealthVariable || !found.resultVariable) {
      this.showProblem(`${found.display || found.name} needs player health and result variables.`);
      return;
    }

    // Phaser restarts the existing scene object rather than constructing a new
    // one. Reset every piece of round state explicitly, then put a test retry
    // back at the health value with which this test session began.
    this.phase = "idle";
    this.side = "left";
    this.timer = undefined;
    this.art = undefined;
    if (data.mode === "test") {
      if (this.testStart?.name === found.name) {
        this.state.stats.set(found.playerHealthVariable, this.testStart.playerHealth);
      } else {
        this.testStart = {
          name: found.name,
          playerHealth: this.state.stats.get(found.playerHealthVariable),
        };
      }
      try {
        this.state.engine.setVariable(found.resultVariable, "");
        this.state.refresh();
      } catch (error) {
        console.error(`Could not reset minigame result ${found.resultVariable}.`, error);
      }
    } else {
      this.testStart = null;
    }

    const read = (name: string): number => this.state.stats.get(name);
    this.config = {
      opponentHealth: resolveTunable(found.opponentHealth, read, 1),
      incomingDamage: resolveTunable(found.incomingDamage, read, 0),
      counterDamage: resolveTunable(found.counterDamage, read, 0),
      prepWindowMs: resolveTunable(found.prepWindowMs, read, 150, 10_000),
      counterWindowMs: resolveTunable(found.counterWindowMs, read, 150, 10_000),
      counterChancePercent: resolveTunable(found.counterChancePercent, read, 0, 100),
      idleMs: resolveTunable(found.idleMs, read, 0, 10_000),
      strikeMs: resolveTunable(found.strikeMs, read, 100, 5_000),
    };
    this.opponentHealth = this.config.opponentHealth;
    const player = Math.max(0, this.state.stats.get(found.playerHealthVariable));
    const playerDef = this.state.stats.snapshot().find((one) => one.key === found.playerHealthVariable);
    this.playerMax = Math.max(1, playerDef?.max ?? player);

    this.cameras.main.setBackgroundColor("#090b12");
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x090b12).setOrigin(0).setDepth(-100);
    this.showBackground();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070c, 0.32).setOrigin(0).setDepth(-80);
    this.add
      .text(GAME_WIDTH / 2, 30, found.display || found.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        color: "#f0e7dc",
      })
      .setOrigin(0.5, 0)
      .setDepth(30);

    this.health = this.add.graphics().setDepth(20);
    this.playerHealthLabel = this.add
      .text(110, 98, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#cfd8ee",
      })
      .setOrigin(0, 0)
      .setDepth(21);
    this.opponentHealthLabel = this.add
      .text(GAME_WIDTH - 110, 98, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#cfd8ee",
      })
      .setOrigin(1, 0)
      .setDepth(21);
    this.status = this.add
      .text(GAME_WIDTH / 2, 535, found.showStateHints ? "Watch for the attack." : "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "23px",
        color: "#f0e7dc",
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.add
      .text(
        GAME_WIDTH / 2,
        660,
        "LEFT CLICK  ·  PARRY LEFT        RIGHT CLICK  ·  PARRY RIGHT        SPACE  ·  COUNTER",
        {
          fontFamily: "system-ui, sans-serif",
          fontSize: "17px",
          color: "#aeb8d0",
        },
      )
      .setOrigin(0.5)
      .setDepth(30);

    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.parry("left");
      else if (pointer.rightButtonDown()) this.parry("right");
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.counter());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearTimer());
    this.drawHealth();
    this.showArt("idle");
    if (this.state.stats.get(found.playerHealthVariable) <= 0) {
      this.resolve("defeat");
    } else {
      this.beginIdle();
    }
  }

  private beginIdle(): void {
    if (this.phase === "resolved") return;
    this.phase = "idle";
    this.showArt("idle");
    this.setStateHint("Watch for the attack.");
    this.schedule(this.config.idleMs, () => this.beginPrep());
  }

  private beginPrep(): void {
    this.phase = "prep";
    this.side = Math.random() < 0.5 ? "left" : "right";
    this.showArt(`${this.side}_prep`);
    this.setStateHint(`${this.side.toUpperCase()} — parry now!`);
    this.schedule(this.config.prepWindowMs, () => this.strike());
  }

  private parry(side: Side): void {
    if (this.phase !== "prep") return;
    this.clearTimer();
    if (side !== this.side) {
      this.strike();
      return;
    }

    this.phase = "counter";
    this.showArt("vulnerable");
    this.setStateHint("Parried — SPACE to counter!");
    this.schedule(this.config.counterWindowMs, () => this.beginIdle());
  }

  private counter(): void {
    if (this.phase !== "counter") return;
    this.clearTimer();
    const lands = Math.random() * 100 < this.config.counterChancePercent;
    if (lands) {
      this.opponentHealth = Math.max(0, this.opponentHealth - this.config.counterDamage);
      this.setStateHint(`Counter landed for ${this.config.counterDamage}.`);
      this.drawHealth();
      if (this.opponentHealth <= 0) {
        this.schedule(350, () => this.resolve("victory"));
        return;
      }
    } else {
      this.setStateHint("The counter missed.");
    }
    this.schedule(500, () => this.beginIdle());
  }

  private strike(): void {
    if (this.phase === "resolved") return;
    this.clearTimer();
    this.phase = "strike";
    this.showArt(`${this.side}_strike`);
    const health = Math.max(
      0,
      this.state.stats.get(this.gameDef.playerHealthVariable) - this.config.incomingDamage,
    );
    this.state.stats.set(this.gameDef.playerHealthVariable, health);
    this.setStateHint(`Hit for ${this.config.incomingDamage}.`);
    this.drawHealth();
    if (health <= 0) {
      this.schedule(this.config.strikeMs, () => this.resolve("defeat"));
    } else {
      this.schedule(this.config.strikeMs, () => this.beginIdle());
    }
  }

  private resolve(result: "victory" | "defeat"): void {
    this.clearTimer();
    this.phase = "resolved";
    this.showArt("idle");
    try {
      this.state.engine.setVariable(this.gameDef.resultVariable, result);
      this.state.refresh();
    } catch (error) {
      console.error(`Could not set minigame result ${this.gameDef.resultVariable}.`, error);
    }
    this.status.setText(result === "victory" ? "Victory." : "Defeat.");
    if (this.launchData.mode === "test") {
      makeButton(
        this,
        GAME_WIDTH / 2,
        635,
        "TEST AGAIN",
        () => this.scene.restart(this.launchData),
        { width: 340, height: 72, fontSize: "24px" },
      ).setDepth(60);
    } else {
      makeButton(
        this,
        GAME_WIDTH / 2,
        635,
        "RETURN TO STORY",
        () => {
          this.scene.resume(SceneKey.VN);
          this.scene.stop();
        },
        { width: 340, height: 72, fontSize: "24px" },
      ).setDepth(60);
    }
  }

  private drawHealth(): void {
    const player = Math.max(0, this.state.stats.get(this.gameDef.playerHealthVariable));
    const opponentMax = Math.max(1, this.config.opponentHealth);
    this.health.clear();
    this.bar(110, 72, 420, player / this.playerMax, 0x4f8dd6);
    this.bar(GAME_WIDTH - 530, 72, 420, this.opponentHealth / opponentMax, 0xbc4b51);
    this.playerHealthLabel.setText(`Player ${player}/${this.playerMax}`);
    this.opponentHealthLabel.setText(`Opponent ${this.opponentHealth}/${opponentMax}`);
  }

  private setStateHint(message: string): void {
    this.status.setText(this.gameDef.showStateHints ? message : "");
  }

  private bar(x: number, y: number, width: number, ratio: number, colour: number): void {
    this.health.fillStyle(0x242938, 1).fillRoundedRect(x, y, width, 20, 8);
    this.health.fillStyle(colour, 1).fillRoundedRect(x, y, width * Phaser.Math.Clamp(ratio, 0, 1), 20, 8);
  }

  private showArt(state: CombatantState): void {
    const resolved = getAssetIndex(this).resolveById(this.gameDef.opponentAssetId, state);
    this.art?.destroy();
    this.art = undefined;
    if (!resolved) {
      this.status?.setText(`Missing opponent art: ${state}`);
      return;
    }
    const art = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, resolved.key)
      .setOrigin(0.5)
      .setDepth(10);
    art.setScale(GAME_HEIGHT / Math.max(art.height, 1));
    this.art = art;
  }

  private showBackground(): void {
    if (!this.gameDef.background) return;
    const resolved = getAssetIndex(this).resolveRef(this.gameDef.background);
    if (!resolved || resolved.kind !== "background" || isVideoFile(resolved.path)) {
      console.warn(`Could not display the combat background for ${this.gameDef.name}.`);
      return;
    }
    const background = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, resolved.key)
      .setDepth(-90);
    background.setScale(Math.max(
      GAME_WIDTH / Math.max(background.width, 1),
      GAME_HEIGHT / Math.max(background.height, 1),
    ));
  }

  private schedule(delay: number, action: () => void): void {
    this.clearTimer();
    this.timer = this.time.delayedCall(delay, action);
  }

  private clearTimer(): void {
    if (!this.timer) return;
    this.time.removeEvent(this.timer);
    this.timer = undefined;
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
