import type Phaser from 'phaser';
import { minigameModules } from '@/bundle/spec/bundle/minigameDoc';
import { SceneKey } from '@/config/gameConfig';

export interface MinigamePlayer {
  kind: string;
  sceneKey: string;
  scene: new () => Phaser.Scene;
}

const files = import.meta.glob<{ default: MinigamePlayer }>('./*/player.ts', { eager: true });
const modules = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, file]) => {
  if (path !== `./${file.default.kind}/player.ts`) throw new Error(`Minigame folder does not match its kind: ${path}`);
  return file.default;
});
const byKind = new Map<string, MinigamePlayer>();
const keys = new Set<string>([...Object.values(SceneKey), 'MissingMinigame']);
for (const module of modules) {
  if (byKind.has(module.kind)) throw new Error(`Duplicate minigame player: ${module.kind}`);
  if (keys.has(module.sceneKey)) throw new Error(`Duplicate minigame scene: ${module.sceneKey}`);
  if (!minigameModules.has(module.kind)) throw new Error(`Unknown minigame player: ${module.kind}`);
  byKind.set(module.kind, module);
  keys.add(module.sceneKey);
}
for (const kind of minigameModules.keys()) {
  if (!byKind.has(kind)) throw new Error(`Missing minigame player: ${kind}`);
}

export const minigameScenes = modules.map((module) => module.scene);
export function minigameScene(kind: string | undefined): string {
  return (kind && byKind.get(kind)?.sceneKey) || 'MissingMinigame';
}
