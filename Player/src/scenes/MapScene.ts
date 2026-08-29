import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import { getAssetIndex, getBundle } from "@/bundle/registry";
import { hostFor, isLocationAvailable, type MapLocation } from "@/world/locations";
import { findMap } from "@/bundle/spec/bundle/mapDoc";
import type { HotspotState } from "@/bundle/spec/mediaDoc";
import type { VNScene } from "@/scenes/VNScene";
import { makeButton } from "@/ui/Button";
import { UI_TEXT } from "@/config/uiText";
import { registerFocusable, setControllerActions } from "@/input/FocusNavigation";

export interface MapData {
  /** The scene that launched this overlay, paused beneath it (the VN scene). */
  origin: SceneKey;
}

/**
 * Full-screen map overlay: one map, and a clickable area over each place it
 * leads to — invisible unless the place carries its own art. Launched on top of
 * (and pausing) the VN scene.
 *
 * A bundle may hold several maps, and a place may open one instead of travelling
 * into the story: an overworld whose city gate opens the city, and a city whose
 * road out opens the overworld again. Which one is showing is the story's to say
 * — the maps claim the knots they belong to — except while this overlay is open,
 * where following a link is the reader's own move and stays here.
 *
 * Every place, its hotspot and its gate come from the bundle's `map.json`. The
 * coordinates in it are in the map's own space, which is the picture's own
 * pixels — the editor adopts a map image's natural size as that space and lays
 * hotspots out as fractions of it. So the picture and the coordinates are one
 * thing, and both are fitted into this canvas together.
 */
export class MapScene extends Phaser.Scene {
  private origin!: SceneKey;
  /**
   * Where the map's own space lands on this canvas: a uniform scale and the
   * offset that centres it.
   *
   * One scale for both axes, and the picture drawn to exactly this rectangle,
   * because a hotspot has to stay over the part of the drawing it was put on. A
   * map twice the size of the window and one a quarter of it are the same
   * problem, and neither has anything to do with the size of the window.
   */
  private frame = { x: 0, y: 0, scale: 1 };

  constructor() {
    super(SceneKey.Map);
  }

  create(data: MapData): void {
    this.origin = data.origin;
    setControllerActions(this, { back: () => this.close() });

    // The scene beneath was paused with the pointer still over the button that
    // opened this one. A paused scene's input plugin is inactive, so the
    // pointerout that would have cleared its hand cursor never arrives and the
    // cursor stays a pointer over the whole overlay — which reads as though
    // everything on it were clickable. Closing is fine by comparison: stopping
    // a scene shuts its input down, and that does reset the cursor.
    this.input.resetCursor();

    // Escape is the keyboard equivalent of the Close Map button.
    this.input.keyboard?.on("keydown-ESC", this.close, this);

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0);

    const state = getGameState(this);
    const area = state.showingMap();
    if (!area) {
      // No maps in the bundle at all: the dimmed scene and a way back out.
      this.addCloseButton();
      return;
    }

    // Contained rather than covered: a map is a thing to read all of, and
    // cropping it to fill the window would carry places off the edge of the
    // screen with it. The letterboxed margin shows the dimmed scene beneath.
    const width = area.size.width || GAME_WIDTH;
    const height = area.size.height || GAME_HEIGHT;
    const scale = Math.min(GAME_WIDTH / width, GAME_HEIGHT / height);
    this.frame = {
      x: (GAME_WIDTH - width * scale) / 2,
      y: (GAME_HEIGHT - height * scale) / 2,
      scale,
    };

    // The map picture is an ordinary catalogued background. It is drawn to the
    // map's rectangle rather than fitted separately: the two agreeing is what
    // keeps a hotspot on top of the landmark it names — and since nothing else
    // is drawn, a bundle with no map picture has an empty map.
    const image =
      area.image.length > 0 ? getAssetIndex(this).resolve("background", area.image) : null;
    if (image) {
      this.add
        .image(this.frame.x, this.frame.y, image.key)
        .setOrigin(0)
        .setDisplaySize(width * scale, height * scale);
    }

    // A place leading nowhere is not drawn at all. The export reports it, but a
    // bundle can outlive the story it was written against, and an unreachable
    // door is worse than no door.
    const knots = new Set(getBundle(this).manifest.knots);
    const host = hostFor(state);

    for (const loc of area.locations) {
      if (!this.leadsSomewhere(loc, knots)) continue;
      this.renderHotspot(loc, isLocationAvailable(loc, host));
    }

    this.addCloseButton();
  }

  private addCloseButton(): void {
    makeButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 48, UI_TEXT.mapClose, () => this.close(), {
      width: 220,
      height: 50,
    });
  }

  /** Whether a place has somewhere real to go — a knot in the story, or a map. */
  private leadsSomewhere(loc: MapLocation, knots: ReadonlySet<string>): boolean {
    const { to, name } = loc.destination;

    if (to === "map") {
      if (findMap(getBundle(this).map, name)) return true;
      console.warn(`Map: ${loc.label} opens "${name}", which is not a map in this bundle.`);
      return false;
    }
    // An empty knot list means the manifest did not say, not that nothing is
    // there, so nothing is refused on the strength of it.
    if (knots.size === 0 || knots.has(name)) return true;
    console.warn(`Map: ${loc.label} travels to "${name}", which is not in the story.`);
    return false;
  }

  /**
   * A place on the map.
   *
   * With no art it is an area of the picture that can be clicked and nothing
   * else — the map is a drawing, and whatever the artist put at this spot is
   * the label; a plate standing on top of it would hide the thing it names.
   *
   * A place that *has* art supersedes that. `art` names one `hotspot` asset
   * whose looks are the four states, so a single name carries idle, hover,
   * active and disabled, and the picture is drawn into the rectangle the author
   * laid out — which the editor holds at the art's own aspect, so filling it is
   * not a stretch.
   *
   * Either way a locked place cannot be clicked and gets no hand cursor. With
   * `disabled` art it can still be seen; without it, it stays as invisible as
   * every other unlit part of the drawing.
   */
  private renderHotspot(loc: MapLocation, available: boolean): void {
    const { scale } = this.frame;
    const x = this.frame.x + loc.x * scale;
    const y = this.frame.y + loc.y * scale;
    const width = loc.width * scale;
    const height = loc.height * scale;

    const look = (state: HotspotState): string | null =>
      loc.art.length > 0
        ? (getAssetIndex(this).resolve("hotspot", loc.art, state)?.key ?? null)
        : null;

    if (!available) {
      const shut = look("disabled");
      if (shut) this.add.image(x, y, shut).setDisplaySize(width, height);
      return;
    }

    // Every state falls back towards `idle`, so art that only draws one of them
    // is a hotspot that simply does not react rather than one that vanishes
    // when the pointer arrives.
    const idle = look("idle");
    const hover = look("hover") ?? idle;
    const pressed = look("active") ?? hover;

    const image = idle ? this.add.image(x, y, idle).setDisplaySize(width, height) : null;

    // Re-sized after every change of look: the four are meant to be one picture
    // at four moments and so the same size, but a set where one is not would
    // otherwise jump.
    const wear = (key: string | null): void => {
      if (image && key) image.setTexture(key).setDisplaySize(width, height);
    };

    const zone = this.add
      .zone(x, y, width, height)
      .setInteractive({ useHandCursor: true });
    const controllerMarker = this.add
      .rectangle(x, y, width, height, 0x000000, 0)
      .setStrokeStyle(3, 0xffd98a, 1)
      .setVisible(false);

    zone.on("pointerover", () => wear(hover));
    zone.on("pointerout", () => wear(idle));
    zone.on("pointerdown", () => wear(pressed));
    // Travel on release rather than press, so `active` is a look somebody can
    // actually see, and so a press can be taken back by sliding off it.
    zone.on("pointerup", () => this.follow(loc));
    registerFocusable(this, {
      object: zone,
      activate: () => this.follow(loc),
      onFocus: (focused) => {
        wear(focused ? hover : idle);
        controllerMarker.setVisible(focused);
      },
    });
  }

  /**
   * Follow a place: into the story, or onto another map.
   *
   * A link between maps is not travel — the story has not moved and the reader
   * has not chosen anything in it — so it stays in the overlay and draws the
   * other map. Restarting the scene rather than tearing down each hotspot by
   * hand: everything here is built from the showing map in `create`, so naming a
   * new one and running that again is the whole change.
   */
  private follow(loc: MapLocation): void {
    const { to, name } = loc.destination;

    if (to === "map") {
      getGameState(this).sceneMeta.mapArea = name;
      this.scene.restart({ origin: this.origin } satisfies MapData);
      return;
    }

    this.scene.stop();
    this.scene.resume(this.origin);
    (this.scene.get(SceneKey.VN) as VNScene).jumpTo(name);
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.origin);
  }
}
