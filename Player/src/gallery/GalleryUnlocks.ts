import type { LoadedBundle } from "@/bundle/loadBundle";
import type { GalleryItem } from "@/bundle/spec/bundle/galleryDoc";
import type { MediaKind } from "@/bundle/spec/mediaDoc";
import { PlayerStorage } from "@/platform/Storage";

const PREFIX = "mc:gallery:";

let storageKey = "";
let unlocked = new Set<string>();
let volatile = false;
let bundle: LoadedBundle | null = null;

const keyOf = (ref: { assetId: string; variantId: string }): string =>
  `${ref.assetId}:${ref.variantId}`;

/** Persistent, per-game gallery progress, deliberately independent of save slots. */
export const GalleryUnlocks = {
  use(next: LoadedBundle, options: { volatile?: boolean } = {}): void {
    bundle = next;
    storageKey = `${PREFIX}${next.manifest.project.id}`;
    volatile = options.volatile ?? false;
    unlocked = new Set<string>();
    if (volatile) return;
    try {
      const parsed: unknown = JSON.parse(PlayerStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(parsed)) {
        unlocked = new Set(parsed.filter((one): one is string => typeof one === "string"));
      }
    } catch {
      unlocked = new Set<string>();
    }
  },

  isUnlocked(item: GalleryItem): boolean {
    return unlocked.has(keyOf(item));
  },

  /** Record a background/animation look when its story tag is processed. */
  activate(kind: Extract<MediaKind, "background" | "animation">, name: string, variant: string | null): void {
    if (!bundle) return;
    const asset = bundle.media.assets.find((one) => one.kind === kind && one.name === name);
    const look = variant === null
      ? asset?.variants[0]
      : asset?.variants.find((one) => one.name === variant);
    if (!asset || !look) return;

    const wanted = { assetId: asset.id, variantId: look.id };
    const isGalleryItem = bundle.gallery.groups.some((group) =>
      group.items.some((item) => keyOf(item) === keyOf(wanted)),
    );
    if (!isGalleryItem || unlocked.has(keyOf(wanted))) return;

    unlocked.add(keyOf(wanted));
    if (!volatile) PlayerStorage.setItem(storageKey, JSON.stringify([...unlocked]));
  },
};
