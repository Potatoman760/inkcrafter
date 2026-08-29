import type Phaser from "phaser";
import type { GameState } from "@/state/GameState";
import { GAME_STATE_KEY } from "@/scenes/BootScene";

/** Typed accessor for the shared GameState stored on the game registry. */
export function getGameState(scene: Phaser.Scene): GameState {
  const state = scene.registry.get(GAME_STATE_KEY) as GameState | undefined;
  if (!state) {
    throw new Error("GameState not initialised — BootScene must run first.");
  }
  return state;
}
