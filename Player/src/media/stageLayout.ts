import type { StageSlot } from "@/narrative/tags";

/**
 * Where characters stand, and how big they are drawn.
 *
 * Bundle art arrives at whatever size it was drawn: the two games in this repo
 * hold a 420×620 sprite and a 90×120 one, five times apart, and both are meant
 * to read as a person standing in a room. So nothing here is a pixel size of a
 * source image — every number is a fraction of the stage, and an image's own
 * dimensions are only ever used as an aspect ratio.
 *
 * The stage is passed in rather than imported. It is `GAME_WIDTH`/`GAME_HEIGHT`
 * today and the bundle's `manifest.stage` says the same thing, so there is
 * nothing to choose between them yet — but a game authored at another size
 * would change that, and this way it is one argument rather than a rewrite.
 */

export interface Stage {
  width: number;
  height: number;
}

/** The fraction of stage width each slot's centre line falls on. */
export const SLOT_X: Record<StageSlot, number> = {
  left: 0.22,
  middle: 0.5,
  right: 0.78,
};

/**
 * The floor: the fraction of stage height a character's feet land on.
 *
 * The bottom edge, because that is where the background ends. A backdrop is
 * cover-fitted to the canvas, so anything short of 1 leaves a character
 * standing on a line that is not in the picture — which reads as floating
 * rather than as standing somewhere.
 */
export const BASELINE_Y = 1;

/**
 * How tall a character is drawn, as a fraction of the stage.
 *
 * Nearly the whole of it. Cutout art is a person head to foot — the bundles
 * here carry 1080×1920 portraits — and a visual novel stands them at the full
 * height of the frame with the dialogue panel over their knees. Anything much
 * smaller reads as a doll placed in the scene rather than somebody in it.
 */
export const CHARACTER_HEIGHT = 0.95;

/** Nothing is drawn wider than this fraction of the stage. */
export const MAX_CHARACTER_WIDTH = 0.42;

/** How far small art may be blown up before it is left small instead. */
export const MAX_UPSCALE = 2;

export const DEPTH = {
  background: 0,
  sprite: 10,
  /** Whoever is speaking, one step forward, so a shared slot never hides them. */
  spriteActive: 11,
  /**
   * The wash that separates an effect from the scene it happens to.
   *
   * Over the background and the whole cast, so what is underneath reads as a
   * scene being acted upon rather than as a room somebody is standing in.
   * Under the dialogue, which is the one layer nothing may cover.
   */
  animCover: 20,
  /** The effect itself, over that wash. Several stack in the order they came. */
  anim: 21,
  video: 100,
} as const;

/**
 * The wash laid over the scene while an effect is running.
 *
 * White rather than the dark scrim the menus use: this is the story's frame
 * rather than the app's chrome, and a pale wash is what a flashback or a spell
 * looks like.
 */
export const ANIM_COVER = { color: 0xffffff, alpha: 0.62 } as const;

/** How a character who is not speaking is played down. */
export const EMPHASIS = {
  active: { alpha: 1, scale: 1, depth: DEPTH.spriteActive },
  /** A cooler cast, a touch translucent, half a step back. */
  inactive: { tint: 0x8892a8, alpha: 0.85, scale: 0.94, depth: DEPTH.sprite },
} as const;

/**
 * The scale that draws a sprite of `natural` size at the right height.
 *
 * Height-driven rather than a cover fit, because a cast reads as a row of
 * figures standing on one floor: matching their heights is the thing that makes
 * two pictures drawn at different resolutions look like two people in the same
 * room. Width then clamps, so banner-shaped art cannot eat the stage; and
 * upscaling is capped, because a 90×120 placeholder stretched to 450px tall is
 * four visible pixels per pixel, which is worse to look at than a small
 * character.
 */
export function characterScale(natural: Stage, stage: Stage): number {
  const width = natural.width || stage.width;
  const height = natural.height || stage.height;

  const byHeight = (stage.height * CHARACTER_HEIGHT) / height;
  const byWidth = (stage.width * MAX_CHARACTER_WIDTH) / width;

  return Math.min(byHeight, byWidth, MAX_UPSCALE);
}

/**
 * The point on the floor a character's feet are pinned to.
 *
 * Feet rather than centres: art of different heights sharing a centre line
 * floats at different distances off the ground, and a common baseline is what
 * puts everyone in the same room. It also means the inactive scale-down shrinks
 * a character about their feet, so nobody drifts when the speaker changes.
 */
export function slotPosition(slot: StageSlot, stage: Stage): { x: number; y: number } {
  return { x: stage.width * SLOT_X[slot], y: stage.height * BASELINE_Y };
}
