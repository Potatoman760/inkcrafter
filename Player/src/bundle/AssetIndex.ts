import type { LoadedBundle } from "@/bundle/loadBundle";
import { assetKey, type BundleAsset } from "@/bundle/spec/bundle/manifest";
import { findAsset, type MediaKind } from "@/bundle/spec/mediaDoc";
import { TAG_PREFIX } from "@/bundle/spec/mediaTag";
import type { GalleryMediaRef } from "@/bundle/spec/bundle/galleryDoc";
import type Phaser from "phaser";

/**
 * What an ink tag points at, once the bundle is loaded.
 *
 * `# bg: courtyard` names a *catalogue* entry, not a file. Resolving it is two
 * steps — find the asset and pick a look, then find the file that look was
 * exported as — and this holds both so the media layer can ask one question.
 *
 * The texture key is recomputed from the catalogue rather than looked up by
 * path, using the same `assetKey` the exporter used. Both sides deriving it
 * from the same names is what lets a tag reach a loaded texture without the
 * bundle shipping a lookup table.
 */
export interface ResolvedAsset {
  /** The Phaser texture or video key the file was loaded under. */
  key: string;
  /** Null only for a protected video that has not been asked for yet. */
  url: string | null;
  /** Original logical path, retained inside encrypted metadata for kind detection. */
  path: string;
}

export class AssetIndex {
  private readonly bundle: LoadedBundle;
  private readonly byKey: Map<string, BundleAsset>;

  private constructor(bundle: LoadedBundle) {
    this.bundle = bundle;
    this.byKey = new Map(bundle.manifest.assets.map((asset) => [asset.key, asset]));
  }

  static from(bundle: LoadedBundle): AssetIndex {
    return new AssetIndex(bundle);
  }

  /** Every file to preload, with the key and URL to load it under. */
  get files(): { asset: BundleAsset; url: string }[] {
    return this.bundle.manifest.assets.flatMap((asset) => {
      const url = this.bundle.cachedAssetUrl(asset.path);
      return url ? [{ asset, url }] : [];
    });
  }

  /**
   * Resolves a tag to a loaded file, or null.
   *
   * A `variant` of null means "whichever comes first", which is what a bare
   * `# bg: courtyard` asks for and why variant order is more than presentation.
   * A named variant that does not exist resolves to nothing rather than falling
   * back to the first: silently showing the wrong expression is worse than
   * showing none.
   */
  resolve(kind: MediaKind, name: string, variant: string | null = null): ResolvedAsset | null {
    const asset = findAsset(this.bundle.media, kind, name);
    if (!asset) return null;

    const look =
      variant === null
        ? asset.variants[0]
        : asset.variants.find((candidate) => candidate.name === variant);

    if (!look) return null;

    // A hotspot has no tag prefix because no tag names one — the map does, by
    // asset name. The exporter falls back to the kind itself for those, so this
    // has to as well: both sides deriving the key the same way is the whole
    // reason the bundle ships no lookup table.
    const key = assetKey(TAG_PREFIX[kind] ?? kind, asset.name, look.name);
    // A catalogued look whose file was missing at export time never made it
    // into the manifest, so it was never loaded and must not be asked for.
    const file = this.byKey.get(key);
    if (!file) return null;

    return { key, url: this.bundle.cachedAssetUrl(file.path), path: file.path };
  }

  /** Resolve a stable media reference used by catalogues rather than by ink tags. */
  resolveById(assetId: string, variant: string): ResolvedAsset | null {
    const asset = this.bundle.media.assets.find((one) => one.id === assetId);
    return asset ? this.resolve(asset.kind, asset.name, variant) : null;
  }

  /** Decrypt and register one protected video only when the story first displays it. */
  async prepareVideo(scene: Phaser.Scene, asset: ResolvedAsset): Promise<ResolvedAsset> {
    if (asset.url) return asset;
    const url = await this.bundle.assetUrl(asset.path);
    if (!scene.cache.video.exists(asset.key)) {
      scene.cache.video.add(asset.key, { url, noAudio: false, crossOrigin: undefined });
    }
    return { ...asset, url };
  }

  /** Resolve a gallery's stable media ids back to the preloaded file. */
  resolveRef(ref: GalleryMediaRef): (ResolvedAsset & { kind: MediaKind; label: string }) | null {
    const asset = this.bundle.media.assets.find((one) => one.id === ref.assetId);
    const look = asset?.variants.find((one) => one.id === ref.variantId);
    if (!asset || !look) return null;
    const resolved = this.resolve(asset.kind, asset.name, look.name);
    return resolved
      ? { ...resolved, kind: asset.kind, label: `${asset.display || asset.name} — ${look.name}` }
      : null;
  }

  /** Whether the catalogue has this asset at all, for distinguishing typos from gaps. */
  has(kind: MediaKind, name: string): boolean {
    return findAsset(this.bundle.media, kind, name) !== null;
  }
}
