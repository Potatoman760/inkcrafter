/**
 * Central, dependency-free constants for the game.
 * Keeping these in one place makes scenes, the media layer, and the save
 * system agree on resolution, asset keys, and storage keys.
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * Games, and which one to play.
 *
 * Everything outside `game/` is engine; each folder inside it is one whole
 * game — a bundle exported by InkCrafter, complete with its own media. Vite's
 * static root is `game/`, so a folder `game/<id>/` is served at `<id>/` and an
 * id is all the engine needs to find one.
 */
export const GAME = {
  /** The game to play when the URL does not name one. */
  default: "breedhaven",
} as const;

/** Phaser scene keys. */

export const SceneKey = {
  Boot: "Boot",
  MainMenu: "MainMenu",
  Settings: "Settings",
  VN: "VN",
  SaveLoad: "SaveLoad",
  Map: "Map",
  Character: "Character",
  Word: "Word",
  Gallery: "Gallery",
} as const;
export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

/**
 * There is deliberately no asset registry here any more.
 *
 * Backgrounds, sprites and video used to be listed twice — once as a loader
 * manifest, and once as a map from the name an ink tag writes to the texture
 * key it was loaded under — which meant adding a picture meant editing this
 * file and rebuilding the game. Both lists now come from the bundle's
 * `media.json`, resolved at runtime by `AssetIndex`.
 */

/** The map overlay looks for a background asset catalogued under this name. */
export const MAP_IMAGE = "map";

/** localStorage save configuration. */
export const SAVE = {
  /**
   * Bump when the save schema changes incompatibly.
   *
   * 2: `SceneMeta` holds `{ name, variant }` for the background and for each
   *    sprite, where it used to hold a bare name.
   * 3: each sprite carries the slot it stands in, and the frame carries the
   *    rule for which character it leans on.
   */
  version: 3,
  /** Slots are keyed `<prefix><project id>:<slot>` — see `SaveManager.use`. */
  prefix: "mc:save:",
  /** Four numbered pages of ten manual saves: 40 deliberate bookmarks. */
  manualPages: 4,
  slotsPerPage: 10,
  /** Separate rotating pages, matching the way readers use these saves. */
  quickSlots: 10,
  autosaveSlots: 10,
} as const;
