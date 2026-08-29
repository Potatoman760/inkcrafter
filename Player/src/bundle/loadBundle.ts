import { GAME } from "@/config/gameConfig";
import {
  BUNDLE_FILES,
  manifestProblem,
  type BundleManifest,
} from "@/bundle/spec/bundle/manifest";
import {
  parsePreviewCheckpoint,
  type PreviewCheckpoint,
} from "@/bundle/spec/bundle/preview";
import { emptyMedia, parseMedia, type MediaDocument } from "@/bundle/spec/mediaDoc";
import {
  emptyCatalogue,
  parseCatalogue,
  type CatalogueExport,
} from "@/bundle/spec/bundle/catalogue";
import { emptyNpcs, parseNpcs, type NpcDocument } from "@/bundle/spec/bundle/npcDoc";
import { emptyMap, parseMap, type MapDocument } from "@/bundle/spec/bundle/mapDoc";
import {
  emptyGallery,
  parseGallery,
  type GalleryDocument,
} from "@/bundle/spec/bundle/galleryDoc";
import {
  emptyAchievements,
  parseAchievements,
  type AchievementDocument,
} from "@/bundle/spec/bundle/achievementDoc";
import {
  emptyMinigames,
  parseMinigames,
  type MinigameDocument,
} from "@/bundle/spec/bundle/minigameDoc";
import { formatUiText, UI_TEXT } from "@/config/uiText";
import { parseProtectedHeader } from "@/bundle/spec/bundle/protection";
import {
  ProtectedAssetUrls,
  decryptProtectedText,
  parseProtectedPayload,
  unlockContentKey,
} from "@/bundle/protectedFiles";

/**
 * Loading a game — everything it is, fetched at runtime.
 *
 * The story used to be a `?raw` import compiled in the browser at startup,
 * which meant the game and the story it told were one build. A bundle is
 * written by InkCrafter and read here, so the same player runs any story and
 * changing the story does not rebuild the player.
 *
 * Nothing is compiled here. `story.json` arrives already compiled, which is why
 * this repo depends on inkjs's runtime rather than `inkjs/full`.
 */

export interface LoadedBundle {
  manifest: BundleManifest;
  /** Compiled ink, ready for `new Story(json)`. */
  storyJson: string;
  media: MediaDocument;
  /** Stats and items: what to show, and the clamps ink cannot express. */
  catalogue: CatalogueExport;
  /** The cast, and what the story tracks about each of them. */
  npcs: NpcDocument;
  /** Where the reader can travel, and what has to be true first. */
  map: MapDocument;
  /** Unlockable scene groups shown from the title screen. */
  gallery: GalleryDocument;
  /** Steam achievements and the Ink-global conditions that earn them. */
  achievements: AchievementDocument;
  minigames: MinigameDocument;
  /** An absolute URL for a bundle-relative path such as `media/bg/day.png`. */
  url(path: string): string;
  /** Plain URL immediately, or a lazily decrypted Blob URL for protected media. */
  assetUrl(path: string): Promise<string>;
  /** A URL already ready for Phaser's synchronous preload queue, or null. */
  cachedAssetUrl(path: string): string | null;
  protected: boolean;
}

/**
 * Which game to play, and where its folder is.
 *
 * A game is one folder under the static root — `game/game1/` in this repo,
 * served at `game1/` — so an id is enough to locate it and nothing has to be
 * configured to add a second game beside the first. `?game=` picks another
 * folder; `?bundle=` still takes a whole URL, for a bundle served from
 * somewhere else entirely (an old export, another origin) without moving it
 * into the tree. `VITE_GAME` bakes a default into a build that ships one game.
 */
export function gameBaseUrl(): string {
  const query = new URLSearchParams(window.location.search);

  const elsewhere = query.get("bundle");
  if (elsewhere) return elsewhere.endsWith("/") ? elsewhere : `${elsewhere}/`;

  const id = gameId(query.get("game")) ?? gameId(import.meta.env.VITE_GAME) ?? GAME.default;
  return `${id}/`;
}

/** Opaque checkpoint id requested by InkCrafter, or null for an ordinary game. */
export function requestedPreviewId(): string | null {
  const value = new URLSearchParams(window.location.search).get("preview")?.trim() ?? "";
  return value.length > 0 ? value : null;
}

/** A connected-editor launch may bypass the story and open one encounter. */
export function requestedMinigameName(): string | null {
  const value = new URLSearchParams(window.location.search).get("minigame")?.trim() ?? "";
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : null;
}

/**
 * A game id names one folder next to the others, so anything that could climb
 * out of it — a slash, a `..`, a scheme — is not one. It comes from the query
 * string, and `?bundle=` is the honest way to point somewhere arbitrary.
 */
function gameId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed) ? trimmed : null;
}

export async function loadBundle(
  base: string = gameBaseUrl(),
  revision: string | null = null,
): Promise<LoadedBundle> {
  const root = new URL(base, window.location.href);
  const url = (path: string): string => {
    const href = new URL(path, root);
    // Every file in one preview must come from the same export. Busting only
    // the checkpoint could pair it with a cached story or image from the last.
    if (revision) href.searchParams.set("preview", revision);
    return href.href;
  };

  const bootstrap = await fetchJson(url(BUNDLE_FILES.manifest));
  const protectedHeader = parseProtectedHeader(bootstrap);
  if (protectedHeader) {
    const contentKey = await unlockContentKey(protectedHeader);
    const payload = parseProtectedPayload(await decryptProtectedText(
      url(protectedHeader.protection.payload.path),
      contentKey,
      protectedHeader.protection.keyId,
      "bundle-payload",
    ));
    const problem = manifestProblem(payload.manifest);
    if (problem) throw new Error(problem);

    const assets = new ProtectedAssetUrls(
      root,
      contentKey,
      protectedHeader.protection.keyId,
      payload.assets,
    );
    // Images and audio are preloaded by Phaser today, so decrypting them here
    // does not make startup do new work. Videos deliberately stay lazy.
    await Promise.all(
      payload.manifest.assets
        .filter((asset) => asset.kind !== "video")
        .map((asset) => assets.prepare(asset.path)),
    );

    return {
      manifest: payload.manifest,
      storyJson: payload.documents.story,
      media: parseMedia(payload.documents.media),
      catalogue: parseCatalogue(payload.documents.catalogue),
      npcs: parseNpcs(payload.documents.npcs),
      map: parseMap(payload.documents.map),
      gallery: parseGallery(payload.documents.gallery),
      achievements: parseAchievements(payload.documents.achievements ?? "{}"),
      minigames: parseMinigames(payload.documents.minigames ?? "{}"),
      url,
      assetUrl: (path) => assets.prepare(path),
      cachedAssetUrl: (path) => assets.cached(path),
      protected: true,
    };
  }

  const manifest = bootstrap as BundleManifest;

  const problem = manifestProblem(manifest);
  if (problem) throw new Error(problem);

  // Each catalogue goes through the spec's own tolerant parser, so a
  // hand-edited file degrades to a missing sprite rather than a crash. The
  // story is the only one that has to be there — a bundle exported before a
  // catalogue existed simply has none, and the game runs without it.
  const [storyJson, media, catalogue, npcs, map, gallery, achievements, minigames] = await Promise.all([
    fetchText(url(BUNDLE_FILES.story)),
    optional(url(BUNDLE_FILES.media), parseMedia, emptyMedia()),
    optional(url(BUNDLE_FILES.catalogue), parseCatalogue, emptyCatalogue()),
    optional(url(BUNDLE_FILES.npcs), parseNpcs, emptyNpcs()),
    optional(url(BUNDLE_FILES.map), parseMap, emptyMap()),
    optional(url(BUNDLE_FILES.gallery), parseGallery, emptyGallery()),
    optional(url(BUNDLE_FILES.achievements), parseAchievements, emptyAchievements()),
    optional(url(BUNDLE_FILES.minigames), parseMinigames, emptyMinigames()),
  ]);

  return {
    manifest,
    storyJson,
    media,
    catalogue,
    npcs,
    map,
    gallery,
    achievements,
    minigames,
    url,
    assetUrl: async (path) => url(path),
    cachedAssetUrl: (path) => url(path),
    protected: false,
  };
}

/**
 * Load the one checkpoint named by the launch URL and prove it belongs beside
 * this exact bundle. Refusing stale data is safer than opening the right game
 * at the wrong scene, especially while Vite is watching a replaced directory.
 */
export async function loadPreviewCheckpoint(
  bundle: LoadedBundle,
  requestedId: string,
): Promise<PreviewCheckpoint> {
  const href = new URL(bundle.url(BUNDLE_FILES.preview));
  href.searchParams.set("preview", requestedId);
  const checkpoint = parsePreviewCheckpoint(await fetchText(href.href));

  if (!checkpoint) throw new Error("The preview checkpoint is not valid.");
  if (checkpoint.id !== requestedId) {
    throw new Error("This preview has been replaced. Run Preview in player again.");
  }
  if (checkpoint.bundleId !== bundle.manifest.project.id) {
    throw new Error("The preview checkpoint belongs to another project.");
  }
  if (checkpoint.contentHash !== bundle.manifest.contentHash) {
    throw new Error("The preview checkpoint belongs to an older story build.");
  }
  return checkpoint;
}

/** A document the bundle may not carry: absent is empty, not an error. */
async function optional<T>(href: string, parse: (json: string) => T, fallback: T): Promise<T> {
  try {
    return parse(await fetchText(href));
  } catch {
    return fallback;
  }
}

async function fetchText(href: string): Promise<string> {
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(
      formatUiText(UI_TEXT.bundleLoadFailed, {
        url: href,
        status: response.status,
        statusText: response.statusText,
      }),
    );
  }
  return response.text();
}

async function fetchJson(href: string): Promise<unknown> {
  const text = await fetchText(href);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(formatUiText(UI_TEXT.bundleInvalidJson, { url: href }));
  }
}
