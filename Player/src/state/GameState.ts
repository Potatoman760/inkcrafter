import { StoryEngine } from "@/narrative/StoryEngine";
import { StatsManager, statDefsFrom } from "@/state/StatsManager";
import { NpcManager } from "@/state/NpcManager";
import type { LoadedBundle } from "@/bundle/loadBundle";
import {
  slotFor,
  type ActiveRule,
  type StageSlot,
  type TagCommand,
  type VideoLoopRange,
} from "@/narrative/tags";
import { findMap, mapForKnot, type MapArea } from "@/bundle/spec/bundle/mapDoc";
import { spriteForSpeaker } from "@/state/npcs";
import { assertNever } from "@/util/exhaustive";
import { GalleryUnlocks } from "@/gallery/GalleryUnlocks";
import { AchievementManager } from "@/achievements/AchievementManager";

/**
 * Snapshot of the on-screen presentation: which background and character
 * sprites are showing, and the current speaker. Saved alongside ink state so a
 * loaded game can rebuild the exact visual frame without re-running the story.
 */
/**
 * A catalogued asset as a tag named it: which asset, and which look.
 *
 * `variant: null` means "whichever comes first", which is what a bare
 * `# bg: courtyard` asks for. Held as names rather than resolved texture keys so
 * a save survives the art being re-exported from different files.
 */
/**
 * The name a line opens with, as in `Kael: I don't know.`
 *
 * Only ever a *candidate*: whether it means anybody is settled by looking for
 * them on stage, so ordinary prose that happens to carry a colon — "She said:
 * run" — names nobody and changes nothing. Bounded in length and refused a
 * sentence's worth of punctuation for the same reason.
 */
function nameBefore(text: string): string {
  const token = /^\s*([^:\n]{1,32}):\s/.exec(text)?.[1]?.trim() ?? "";
  return /[.!?,;"]/.test(token) ? "" : token;
}

export interface MediaRef {
  name: string;
  variant: string | null;
}

/** The scene backdrop, including how a video advances after it is shown. */
export interface BackgroundRef extends MediaRef {
  /** False/absent loops; true plays once and leaves the final frame visible. */
  once?: boolean;
  /**
   * Drawn mirrored left to right — a corridor receding right is a second
   * corridor for free.
   *
   * Restated by every `# bg:`, so a tag that does not say the word puts the art
   * back the way it was drawn. It reads as a setting only because a background
   * is one: nothing restates it until another background tag arrives.
   */
  flipped?: boolean;
  /** Intro plays once, then this interval repeats. Absent means a full loop. */
  loop?: VideoLoopRange;
}

/** A character on stage: which asset, which look, and where they are standing. */
export interface SpriteRef extends MediaRef {
  slot: StageSlot;
  /**
   * Drawn mirrored, for art facing the wrong way across the stage.
   *
   * Unlike `slot`, this is *not* inherited: the grammar has every `# show:`
   * state it outright, so a tag that does not say `flipped` means "as drawn"
   * rather than "unchanged". There is no word for turning it off because
   * nothing is holding it on.
   */
  flipped: boolean;
}

/**
 * Who the frame leans on.
 *
 * Three answers rather than a name-or-nothing, because "nobody in particular is
 * speaking" and "play everybody down" are different instructions and only one
 * of them is ever written on purpose. A cast standing about between lines is at
 * full strength; being played down is something another character's line does
 * to them.
 */
export type Emphasis =
  /** One character has the line; everybody else is played down. */
  | { kind: "on"; name: string }
  /** Nobody is named, so nobody is played down. */
  | { kind: "everyone" }
  /** `# active: none`, the one way to ask for the whole cast to stand back. */
  | { kind: "nobody" };

/** An effect over the scene: which asset, which look, and whether mirrored. */
export interface AnimRef extends MediaRef {
  flipped: boolean;
  /** Intro plays once, then this interval repeats. Absent means a full loop. */
  loop?: VideoLoopRange;
}

/** One live Ink value requested by `# display:` for a single top-level knot. */
export interface VariableDisplayRef {
  variable: string;
  label: string;
  knot: string | null;
}

export interface SceneMeta {
  background: BackgroundRef | null;
  /**
   * The track under the scene, or null for silence.
   *
   * Saved like the background because it is the same kind of thing: a setting
   * that holds until a tag changes it. A load that rebuilt the picture and not
   * the music would drop the reader back into a scene that sounds wrong.
   */
  music: MediaRef | null;
  sprites: SpriteRef[];
  speaker: string;
  /**
   * The looping effects running over the scene — rain, a spell, a flashback.
   *
   * Held apart from `sprites` because they are not people: nobody speaks, so
   * none is ever the active one, they are cleared by different words, and the
   * two are separate namespaces — a story may have a character called `rain`
   * and an effect called `rain`. No slot, because an effect fills what it can
   * rather than standing in a third of the frame.
   */
  anims: AnimRef[];
  /** The body text of the line currently on screen (for resuming a load). */
  lastText: string;
  /**
   * Which map the reader is looking at, by its catalogue name.
   *
   * Saved because it is sticky: a map claims the knots it belongs to, and a knot
   * nobody claims leaves the showing map alone — so only the knots where the map
   * *changes* are listed, and the answer at any other moment is "whatever it was
   * before". That makes it state rather than something a load could recompute.
   *
   * Null until a claimed knot or a hotspot has named one.
   */
  mapArea: string | null;
  /** Whether the map button is usable here (toggled by `# map:` tags). */
  mapEnabled: boolean;
  /** The optional top-left readout, automatically dropped at the next knot. */
  display: VariableDisplayRef | null;
  /**
   * Who the frame leans on, as the last `# active:` tag left it.
   *
   * The *rule*, not the character it resolves to. Saving the answer would fix
   * it against a cast list that can change under the save; saving the question
   * means a load works it out again from whatever the bundle now says.
   */
  activeRule: ActiveRule;
}

function emptyMeta(): SceneMeta {
  return {
    background: null,
    music: null,
    sprites: [],
    anims: [],
    speaker: "",
    lastText: "",
    mapArea: null,
    mapEnabled: true,
    display: null,
    activeRule: { rule: "speaker" },
  };
}

/**
 * Central game state: the compiled story, the stats facade over its variables,
 * and the current presentation metadata. A single instance is shared across all
 * Phaser scenes (created once in BootScene).
 */
export class GameState {
  readonly bundle: LoadedBundle;
  engine: StoryEngine;
  stats: StatsManager;
  npcs: NpcManager;
  achievements: AchievementManager;
  sceneMeta: SceneMeta = emptyMeta();

  private constructor(bundle: LoadedBundle, options: { achievementsEnabled: boolean }) {
    this.bundle = bundle;
    // The story arrives compiled, declarations included. Nothing is prepended
    // here any more: the NPC `VAR`s live in the authored ink, so the editor is
    // the only thing that writes declarations, and the two can never both
    // declare the same name and fail the compile.
    this.engine = StoryEngine.fromJson(bundle.storyJson, bundle.manifest.knots);
    this.stats = new StatsManager(this.engine, statDefsFrom(bundle.catalogue));
    this.npcs = new NpcManager(this.engine, bundle.npcs.npcs);
    this.achievements = new AchievementManager(
      this.engine,
      bundle.achievements,
      bundle.manifest.project.id,
      !options.achievementsEnabled,
    );
  }

  static fromBundle(
    bundle: LoadedBundle,
    options: { achievementsEnabled?: boolean } = {},
  ): GameState {
    return new GameState(bundle, { achievementsEnabled: options.achievementsEnabled ?? true });
  }

  /** Release observers held by a disposable preview or memory state. */
  destroy(): void {
    this.achievements.destroy();
  }

  /** Begin a fresh playthrough from the top of the story. */
  newGame(): void {
    this.engine.reset();
    this.sceneMeta = emptyMeta();
    this.refresh();
  }

  /** Restore a pre-paragraph editor checkpoint onto an otherwise empty frame. */
  loadPreview(inkState: string): void {
    this.engine.loadState(inkState);
    this.sceneMeta = emptyMeta();
    this.refresh();
  }

  /** Re-notify all stat/NPC listeners (after newGame or loading a save). */
  refresh(): void {
    this.stats.emit();
    this.npcs.emit();
    this.achievements.refresh();
  }

  /**
   * Update the presentation metadata from a tag command. The VN scene calls
   * this so the saved frame stays in sync with what is on screen. Returns
   * nothing; media side effects are handled separately by the scene.
   */
  trackTag(cmd: TagCommand, knot: string | null): void {
    switch (cmd.kind) {
      case "bg":
        // `# bg: none` clears it. An empty tag set means "unchanged", so
        // clearing has to be something a tag says out loud.
        this.sceneMeta.background =
          cmd.name === null
            ? null
            : {
                name: cmd.name,
                variant: cmd.variant,
                once: cmd.once ?? false,
                flipped: cmd.flipped ?? false,
                ...(cmd.loop ? { loop: cmd.loop } : {}),
              };
        if (cmd.name !== null) GalleryUnlocks.activate("background", cmd.name, cmd.variant);
        break;
      case "show": {
        // Showing someone already on screen changes their look rather than
        // drawing them twice — and leaves them standing where they are, unless
        // the tag asked for somewhere else.
        const at = this.sceneMeta.sprites.findIndex((s) => s.name === cmd.name);
        const ref: SpriteRef = {
          name: cmd.name,
          variant: cmd.variant,
          slot: slotFor(this.sceneMeta.sprites[at]?.slot, cmd.slot),
          flipped: cmd.flipped,
        };
        if (at === -1) this.sceneMeta.sprites.push(ref);
        else this.sceneMeta.sprites[at] = ref;
        break;
      }
      // `# music: stop` is how a scene falls silent; an empty tag set means
      // "unchanged", so silence has to be asked for out loud.
      case "music":
        this.sceneMeta.music =
          cmd.name === null ? null : { name: cmd.name, variant: cmd.variant };
        break;
      // `# anim: none` stops every one of them without touching the cast.
      case "anim": {
        if (cmd.name === null) {
          this.sceneMeta.anims = [];
          break;
        }
        GalleryUnlocks.activate("animation", cmd.name, cmd.variant);
        const at = this.sceneMeta.anims.findIndex((a) => a.name === cmd.name);
        const ref: AnimRef = {
          name: cmd.name,
          variant: cmd.variant,
          flipped: cmd.flipped,
          ...(cmd.loop ? { loop: cmd.loop } : {}),
        };
        if (at === -1) this.sceneMeta.anims.push(ref);
        else this.sceneMeta.anims[at] = ref;
        break;
      }
      case "hide":
        this.sceneMeta.sprites = this.sceneMeta.sprites.filter((s) => s.name !== cmd.name);
        break;
      case "clear":
        this.sceneMeta.background = null;
        this.clearStage();
        break;
      case "speaker":
        this.sceneMeta.speaker = cmd.name;
        break;
      case "display":
        this.sceneMeta.display = { variable: cmd.variable, label: cmd.label, knot };
        break;
      case "map":
        this.sceneMeta.mapEnabled = cmd.enabled;
        break;
      case "active":
        this.sceneMeta.activeRule = cmd.active;
        break;
      // These change the story rather than the frame a load has to rebuild.
      case "stat":
      case "npc":
      case "autosave":
      case "minigame":
      // The reader's answer lands in an Ink variable, which the save already
      // carries; there is nothing about the frame for a load to rebuild.
      case "word":
        break;
      default:
        assertNever(cmd);
    }
  }

  /** Remove a readout inherited from a different knot before presenting a line. */
  enterKnot(knot: string | null): void {
    const display = this.sceneMeta.display;
    if (display && display.knot !== knot) this.sceneMeta.display = null;
  }

  /**
   * Nobody on stage, and nobody to lean on.
   *
   * Travelling somewhere else clears the sprites, and a pin left behind would
   * outlive the scene it was written for — emphasising somebody who is no longer
   * anywhere near the story.
   */
  /**
   * Follow the story onto whichever map claims where it now is.
   *
   * Called after the story moves rather than driven by a tag: which map a reader
   * is looking at is a fact about where they are in the script, so the maps name
   * the knots they cover and the ink says nothing about maps at all. A knot
   * nobody claims leaves the showing map exactly as it was, which is what keeps
   * those lists short — the city gate and the road out, not the scenes between.
   */
  followMap(lastLineKnot: string | null = null): void {
    // END clears Ink's current pointer. The final displayed line still belongs
    // to a knot, and can request opening that knot's map.
    const knot = this.engine.currentKnot() ?? lastLineKnot;
    if (knot === null) return;

    const area = mapForKnot(this.bundle.map, knot);
    if (area) this.sceneMeta.mapArea = area.name;
  }

  /**
   * The map to draw, or null when the bundle has none.
   *
   * Falls back to the first map so a story that never claims a knot still has
   * something to open — one map and no `knots` list at all is the ordinary shape
   * of a small game, and it should not need the list to work.
   */
  showingMap(): MapArea | null {
    const named = this.sceneMeta.mapArea;
    return (named ? findMap(this.bundle.map, named) : null) ?? this.bundle.map.maps[0] ?? null;
  }

  clearStage(): void {
    this.sceneMeta.sprites = [];
    // Rain still falling over the next scene is not what `clear` was asked to do.
    this.sceneMeta.anims = [];
    this.sceneMeta.activeRule = { rule: "speaker" };
  }

  /**
   * The character the frame emphasises, or null for nobody in particular.
   *
   * Worked out from the finished frame rather than from a tag, because tag order
   * within a line is not guaranteed: `# speaker:` appears both before and after
   * `# char:` in stories already written. Reading the answer off `sceneMeta`
   * once the whole line has been tracked makes the order irrelevant.
   *
   * A speaker naming nobody — `Narrator`, or a character with no sprite — leans
   * on nobody, which is what narration should look like.
   */
  emphasis(text: string = this.sceneMeta.lastText): Emphasis {
    const meta = this.sceneMeta;

    // Said out loud by a tag, so it wins over anything inferred.
    if (meta.activeRule.rule === "nobody") return { kind: "nobody" };
    if (meta.activeRule.rule === "character") {
      return { kind: "on", name: meta.activeRule.name };
    }

    // `Kael: I don't know.` — the name the line itself opens with. Prose rather
    // than a tag, and the reader is looking straight at it, which is what makes
    // it the least confusable answer to who is speaking.
    const spoken = this.onStage(nameBefore(text)) ?? this.onStage(meta.speaker);

    // Nobody on stage has the line — narration, or somebody only mentioned — so
    // there is nobody to be played down *against*. The cast stands as it is.
    // This is also what makes a lone character always lit, and a story that
    // never names a speaker look like a story rather than a fault.
    return spoken === null ? { kind: "everyone" } : { kind: "on", name: spoken };
  }

  /**
   * Which sprite on stage a name refers to, or null.
   *
   * Loose on purpose, because the name is written to be read: the cast list
   * turns a display name into a sprite (`Sister Abeline` -> `abeline`), and
   * failing that the sprite's own name is tried, so a story with no cast list
   * still works. A name matching nobody standing there is nobody — which is
   * what a narrator, and a character who is only mentioned, should both be.
   */
  private onStage(name: string): string | null {
    const wanted = name.trim().toLowerCase();
    if (wanted.length === 0) return null;

    const here = (sprite: string): string | null =>
      this.sceneMeta.sprites.some((one) => one.name === sprite) ? sprite : null;

    const cast = spriteForSpeaker(this.bundle.npcs, wanted);
    return (cast && here(cast)) ?? here(wanted);
  }
}
