import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "@/config/gameConfig";
import type { AssetIndex } from "@/bundle/AssetIndex";
import type { Emphasis, SceneMeta } from "@/state/GameState";
import { slotFor, type StageSlot } from "@/narrative/tags";
import {
  ANIM_COVER,
  DEPTH,
  EMPHASIS,
  characterScale,
  slotPosition,
  type Stage,
} from "@/media/stageLayout";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { AudioSettings } from "@/audio/AudioSettings";
import { PlayerSettings } from "@/settings/PlayerSettings";

/** A character on screen: the picture, and the slot they are standing in. */
interface StagedSprite {
  image: Phaser.GameObjects.Image;
  slot: StageSlot;
}

/**
 * Owns the visual layers of the VN scene: the background — a still or a video
 * clip — a set of character sprites keyed by logical name, and the effects
 * running over the whole thing.
 *
 * Logical names come from ink tags (`# bg: courtyard`, `# show: abeline at left`,
 * `# play: vision`) and name entries in the bundle's media catalogue, which
 * `AssetIndex` turns into the keys Phaser loaded those files under.
 *
 * Where a character stands and how big they are drawn is `stageLayout`'s
 * business; this decides who is on screen and which of them the frame leans on.
 */
export class MediaLayer {
  private readonly scene: Phaser.Scene;
  private readonly assets: AssetIndex;
  /** A still or a clip — the scene is set against either. */
  private background?: Phaser.GameObjects.Image | Phaser.GameObjects.Video;
  private readonly sprites = new Map<string, StagedSprite>();
  /** Looping effects, by name, drawn over the whole scene in the order they came. */
  private readonly anims = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Video>();
  /** The wash under them, up only while at least one is running. */
  private cover?: Phaser.GameObjects.Rectangle;
  /** Who the frame is leaning on. A fresh stage leans on nobody in particular. */
  private emphasis: Emphasis = { kind: "everyone" };
  private readonly unsubscribeAudio: () => void;

  constructor(scene: Phaser.Scene, assets: AssetIndex) {
    this.scene = scene;
    this.assets = assets;
    this.unsubscribeAudio = AudioSettings.subscribe(() => this.applyVideoVolume());
  }

  /**
   * The space characters are laid out in.
   *
   * The canvas today, and the bundle's `manifest.stage` says the same thing, so
   * there is nothing yet to choose between them — this is the one place that
   * would change if a game were authored against another size.
   */
  private get stage(): Stage {
    return { width: GAME_WIDTH, height: GAME_HEIGHT };
  }

  /**
   * Set the scene behind everything, from a still or from a video clip.
   *
   * Which one is a question about the file rather than about the story — the
   * catalogue has one `background` kind and both sorts of file live in it — so
   * the path is asked. Replaced rather than re-textured: a still and a clip are
   * different objects, and one cannot become the other.
   */
  async setBackground(
    name: string,
    variant: string | null = null,
    once = false,
    flipped = false
  ): Promise<void> {
    const found = this.assets.resolve("background", name, variant);
    if (!found) {
      console.warn(`Unknown background "${describe(name, variant)}"`);
      return;
    }

    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT / 2;

    if (isVideoFile(found.path)) {
      let ready;
      try {
        ready = await this.assets.prepareVideo(this.scene, found);
      } catch (error) {
        console.error(`Could not prepare background "${describe(name, variant)}".`, error);
        return;
      }
      // Keep the previous scene visible while a protected clip decrypts.
      this.clearBackground();
      const clip = this.scene.add.video(x, y, ready.key).setDepth(DEPTH.background);
      // Keep the clip audible. A browser may defer its first play until the
      // reader interacts with the page; Phaser keeps retrying after that
      // media lock is released. A background loops by default; an authored
      // `once` clip remains alive when playback completes, leaving the last
      // decoded frame visible until another background replaces it.
      clip.setMute(false);
      clip.setVolume(AudioSettings.sfxVolume);
      clip.setLoop(!once);
      clip.play(!once);
      // A clip knows nothing of its own size until it has metadata.
      clip.once(Phaser.GameObjects.Events.VIDEO_PLAY, () => {
        fitToScreen(clip);
        if (PlayerSettings.values.reducedMotion) clip.setPaused(true);
      });
      this.background = clip;
    } else {
      this.clearBackground();
      this.background = this.scene.add.image(x, y, found.key).setDepth(DEPTH.background);
    }

    // After the fit, which sets the scale a mirror is applied on top of.
    fitToScreen(this.background);
    this.background.setFlipX(flipped);
  }

  /** Removes the background without disturbing anyone standing in front of it. */
  clearBackground(): void {
    this.background?.destroy();
    this.background = undefined;
  }

  /**
   * Put a character on screen, or change one already there.
   *
   * `slot` is what the tag asked for, and null is a tag that said nothing about
   * it — which leaves somebody already on screen standing where they are, rather
   * than walking them back to the middle every time their expression changes.
   *
   * `flipped` behaves the opposite way on purpose: the grammar has every show
   * tag state it, so it is set from this call every time and a tag that stays
   * quiet turns a mirrored character back. Phaser mirrors about the origin, and
   * these are anchored feet-down at their middle, so the axis runs straight up
   * through them — a flip turns somebody on the spot instead of sliding them.
   */
  showSprite(
    name: string,
    variant: string | null = null,
    slot: StageSlot | null = null,
    flipped = false
  ): void {
    const key = this.assets.resolve("character", name, variant)?.key;
    if (!key) {
      console.warn(`Unknown sprite "${describe(name, variant)}"`);
      return;
    }

    // Showing someone already on screen changes their look. Re-texturing rather
    // than destroying and re-adding keeps their place in the draw order, which
    // is what stops a character jumping in front of another mid-conversation.
    const standing = this.sprites.get(name);
    if (standing) {
      standing.image.setTexture(key).setFlipX(flipped);
      standing.slot = slotFor(standing.slot, slot);
      // Dressed again rather than merely re-textured: one look can be a
      // different size from another, and would otherwise be drawn at the
      // previous look's scale.
      this.dress(standing, this.lit(name));
      return;
    }

    const staged: StagedSprite = {
      image: this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setFlipX(flipped),
      slot: slotFor(undefined, slot),
    };
    this.sprites.set(name, staged);
    // Dressed before anyone sees it, so a character shown on the same line they
    // start speaking is never dim for a frame.
    this.dress(staged, this.lit(name));
  }

  /**
   * Run a looping effect over the whole scene, on a pale wash.
   *
   * Not a fourth thing standing beside the cast: an effect is rarely a person's
   * width and rarely wants a third of the frame, so it takes as much of the
   * screen as it can without being stretched, and the scene it happens to is
   * washed out behind it.
   *
   * The file may be a clip or a picture and the catalogue does not say which —
   * `animation` is what an asset is *for*, not what it *is* — so the file is
   * asked directly. A still one simply sits there, which is a reasonable thing
   * for a placeholder to do.
   */
  async showAnim(name: string, variant: string | null = null, flipped = false): Promise<void> {
    const found = this.assets.resolve("animation", name, variant);
    if (!found) {
      console.warn(`Unknown animation "${describe(name, variant)}"`);
      return;
    }

    const { width, height } = this.stage;

    if (isVideoFile(found.path)) {
      let ready;
      try {
        ready = await this.assets.prepareVideo(this.scene, found);
      } catch (error) {
        console.error(`Could not prepare animation "${describe(name, variant)}".`, error);
        return;
      }
      this.anims.get(name)?.destroy();
      const clip = this.scene.add.video(width / 2, height / 2, ready.key);
      clip.setMute(false);
      clip.setVolume(AudioSettings.sfxVolume);
      clip.setLoop(true);
      clip.play(true);
      // A video knows nothing of its own size until it has metadata, so the fit
      // is made again once it does; the first one keeps it from flashing.
      clip.once(Phaser.GameObjects.Events.VIDEO_PLAY, () => {
        fitInside(clip, this.stage);
        if (PlayerSettings.values.reducedMotion) clip.setPaused(true);
      });
      fitInside(clip, this.stage);
      this.anims.set(name, clip.setFlipX(flipped).setDepth(DEPTH.anim));
    } else {
      this.anims.get(name)?.destroy();
      const still = this.scene.add.image(width / 2, height / 2, found.key);
      fitInside(still, this.stage);
      this.anims.set(name, still.setFlipX(flipped).setDepth(DEPTH.anim));
    }

    this.refreshCover();
  }

  clearAnims(): void {
    for (const anim of this.anims.values()) anim.destroy();
    this.anims.clear();
    this.refreshCover();
  }

  /** The wash exists exactly while something is running on top of it. */
  private refreshCover(): void {
    const wanted = this.anims.size > 0;
    if (wanted === (this.cover !== undefined)) return;

    if (!wanted) {
      this.cover?.destroy();
      this.cover = undefined;
      return;
    }
    this.cover = this.scene.add
      .rectangle(0, 0, this.stage.width, this.stage.height, ANIM_COVER.color, ANIM_COVER.alpha)
      .setOrigin(0)
      .setDepth(DEPTH.animCover);
  }

  hideSprite(name: string): void {
    this.sprites.get(name)?.image.destroy();
    this.sprites.delete(name);
    // Somebody who has left the stage cannot still be the one being listened to.
    if (this.emphasis.kind === "on" && this.emphasis.name === name) {
      this.emphasis = { kind: "everyone" };
    }
  }

  clearSprites(): void {
    for (const staged of this.sprites.values()) staged.image.destroy();
    this.sprites.clear();
    this.emphasis = { kind: "everyone" };
  }

  /**
   * Lean the frame on one character, or on nobody.
   *
   * Nobody is a real answer rather than a failure: narration is most of a story,
   * and a line nobody in particular speaks should leave the whole cast quiet
   * instead of keeping the last speaker lit and saying the wrong thing.
   */
  setEmphasis(emphasis: Emphasis): void {
    this.emphasis = emphasis;
    for (const [who, staged] of this.sprites) this.dress(staged, this.lit(who));
  }

  /** Whether one character is drawn at full strength under the current rule. */
  private lit(name: string): boolean {
    switch (this.emphasis.kind) {
      case "everyone":
        return true;
      case "nobody":
        return false;
      case "on":
        return this.emphasis.name === name;
    }
  }

  /**
   * Everything about how one character is drawn, decided in one place.
   *
   * Position, size and emphasis together, because they are not independent: the
   * played-down scale multiplies the fitted one, and neither means anything
   * without the baseline they are measured from.
   *
   * Emphasis is an effect and never a change of look. Which picture a character
   * wears is the story's to say, through `# char: kael/wary`; if being spoken
   * could swap it, an expression the author chose would vanish the moment
   * somebody else got a line.
   */
  private dress(staged: StagedSprite, lit: boolean): void {
    const look = lit ? EMPHASIS.active : EMPHASIS.inactive;
    const { x, y } = slotPosition(staged.slot, this.stage);
    const fitted = characterScale(
      { width: staged.image.width, height: staged.image.height },
      this.stage,
    );

    if (lit) staged.image.clearTint();
    else staged.image.setTint(EMPHASIS.inactive.tint);

    staged.image
      .setPosition(x, y)
      .setScale(fitted * look.scale)
      .setAlpha(look.alpha)
      .setDepth(look.depth);
  }

  /**
   * Rebuild the visual frame from saved metadata (used after loading).
   *
   * The emphasis is handed in rather than worked out here: who a line leans on
   * depends on the cast list, and the media layer has no business knowing there
   * is one.
   */
  async rebuildFrom(meta: SceneMeta, emphasis: Emphasis): Promise<void> {
    this.clearSprites();
    this.clearAnims();
    if (meta.background) {
      await this.setBackground(
        meta.background.name,
        meta.background.variant,
        meta.background.once ?? false,
        meta.background.flipped ?? false
      );
    }
    else this.clearBackground();
    // In array order, so the draw order a save recorded comes back with it.
    // `flipped` is undefined in a save written before it existed, which the
    // default parameter reads as "as drawn" — the same answer as the tag that
    // does not mention it.
    for (const sprite of meta.sprites) {
      this.showSprite(sprite.name, sprite.variant, sprite.slot, sprite.flipped);
    }
    this.setEmphasis(emphasis);

    // `anims` is absent from a save written before effects existed, which reads
    // as none — the same as a scene that never started one.
    this.clearAnims();
    for (const anim of meta.anims ?? []) {
      await this.showAnim(anim.name, anim.variant, anim.flipped);
    }
  }

  destroy(): void {
    this.clearSprites();
    this.clearAnims();
    this.background?.destroy();
    this.background = undefined;
    this.unsubscribeAudio();
  }

  private applyVideoVolume(): void {
    if (this.background instanceof Phaser.GameObjects.Video) {
      this.background.setVolume(AudioSettings.sfxVolume);
    }
    for (const anim of this.anims.values()) {
      if (anim instanceof Phaser.GameObjects.Video) anim.setVolume(AudioSettings.sfxVolume);
    }
  }
}

/** A tag's name as it was written, for a warning that can be searched for. */
function describe(name: string, variant: string | null): string {
  return variant === null ? name : `${name}/${variant}`;
}

/**
 * Scale a display object as large as it goes without being stretched or cropped.
 *
 * Contain rather than cover, and it scales *up* as well as down: an effect
 * drawn small would otherwise sit stranded at its natural size in the middle of
 * the stage. A wide one gets bars above and below, a tall one either side.
 */
function fitInside(
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Video,
  stage: Stage
): void {
  const w = obj.width || stage.width;
  const h = obj.height || stage.height;
  obj.setScale(Math.min(stage.width / w, stage.height / h));
  obj.setPosition(stage.width / 2, stage.height / 2);
}

/**
 * Scale a display object so it covers the game canvas.
 *
 * Backgrounds only. A character is fitted to a floor and a height
 * instead (`stageLayout.characterScale`): a cover fit and a floor fit are
 * different intents, and one function doing both would serve neither.
 */
function fitToScreen(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Video): void {
  const w = obj.width || GAME_WIDTH;
  const h = obj.height || GAME_HEIGHT;
  const scale = Math.max(GAME_WIDTH / w, GAME_HEIGHT / h);
  obj.setScale(scale);
  obj.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
}
