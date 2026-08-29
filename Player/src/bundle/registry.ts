import type Phaser from "phaser";
import type { AssetIndex } from "@/bundle/AssetIndex";
import type { LoadedBundle } from "@/bundle/loadBundle";
import type { PreviewCheckpoint } from "@/bundle/spec/bundle/preview";

/**
 * The bundle, on the Phaser registry.
 *
 * Put there before the game boots rather than loaded by a scene: fetching is
 * asynchronous and `preload` is not, so `BootScene` has to already have the
 * bundle in hand by the time it starts registering files with the loader.
 *
 * The keys live here, in a module that imports no scene, so that scenes can
 * import the accessors without the two ending up in a cycle.
 */
export const BUNDLE_KEY = "bundle";
export const ASSET_INDEX_KEY = "assetIndex";
export const PREVIEW_CHECKPOINT_KEY = "previewCheckpoint";
export const TEST_MINIGAME_KEY = "testMinigame";

export function getBundle(scene: Phaser.Scene): LoadedBundle {
  const bundle = scene.registry.get(BUNDLE_KEY) as LoadedBundle | undefined;
  if (!bundle) throw new Error("No bundle on the registry — it is loaded before the game boots.");
  return bundle;
}

export function getAssetIndex(scene: Phaser.Scene): AssetIndex {
  const assets = scene.registry.get(ASSET_INDEX_KEY) as AssetIndex | undefined;
  if (!assets) throw new Error("No AssetIndex on the registry — BootScene must run first.");
  return assets;
}

export function getPreviewCheckpoint(scene: Phaser.Scene): PreviewCheckpoint | null {
  return (scene.registry.get(PREVIEW_CHECKPOINT_KEY) as PreviewCheckpoint | undefined) ?? null;
}

export function getTestMinigame(scene: Phaser.Scene): string | null {
  return (scene.registry.get(TEST_MINIGAME_KEY) as string | undefined) ?? null;
}
