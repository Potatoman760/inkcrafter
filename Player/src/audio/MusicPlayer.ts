import Phaser from "phaser";
import type { AssetIndex } from "@/bundle/AssetIndex";
import { AudioSettings } from "@/audio/AudioSettings";

/**
 * The track under the scene.
 *
 * Music is a *setting* rather than an event: `# music: harbour` holds across
 * every line and every knot until something says otherwise, which is why
 * `# music: stop` has to exist at all — silence is not what a scene falls back
 * to. That makes this the audio counterpart of the background rather than of
 * `# sound:`, which fires a cue and is over.
 *
 * It sits outside `MediaLayer` because sound is not a visual layer and does not
 * behave like one. Phaser's sound manager belongs to the game rather than to a
 * scene, so a track keeps playing while the map or the menu is open over a
 * paused `VNScene` — which is what you want, and the opposite of what happens
 * to anything on the display list. One-shot cues live in SoundPlayer instead.
 */
export class MusicPlayer {
  private readonly scene: Phaser.Scene;
  private readonly assets: AssetIndex;
  private track?: Phaser.Sound.BaseSound;
  private readonly unsubscribeAudio: () => void;
  /** The texture key currently sounding, so a restatement can be recognised. */
  private playing: string | null = null;
  /**
   * The fade taking the current track out, or null if it is at full strength.
   *
   * `level` is what the reader's music volume is multiplied by, so the two stay
   * separate things: a fade is the story turning the music down, and the volume
   * setting is the reader deciding how loud "up" is. `perSecond` is worked out
   * from the level the fade *began* at rather than from 1, so a second stop
   * part-way through an existing fade carries on down from where it had got to
   * instead of jumping back up to full and starting again.
   */
  private fading: { level: number; perSecond: number } | null = null;

  constructor(scene: Phaser.Scene, assets: AssetIndex) {
    this.scene = scene;
    this.assets = assets;
    this.unsubscribeAudio = AudioSettings.subscribe(() => this.applyVolume());
  }

  /**
   * Start a track, or leave it alone if it is already the one playing.
   *
   * The same rule as re-showing a character: a story that opens three knots
   * with `# music: harbour` means "this is the harbour theme", not "start the
   * harbour theme again" — and restarting it from the top on every re-entry is
   * audible in a way a re-textured sprite is not.
   */
  play(name: string, variant: string | null = null): void {
    const key = this.assets.resolve("music", name, variant)?.key;
    if (!key) {
      console.warn(`Unknown music "${variant === null ? name : `${name}/${variant}`}"`);
      return;
    }
    if (this.playing === key) {
      // Named again while it is fading out: the story has asked for the track
      // back before it finished leaving, so it comes back up where it is
      // rather than starting over. That is also what a reader stepping Back
      // over a `# music: stop 5` hears — the stop undone, not the track
      // restarted from the top.
      if (this.fading) {
        this.endFade();
        this.applyVolume();
      }
      return;
    }

    this.cut();
    this.track = this.scene.sound.add(key, {
      loop: true,
      volume: AudioSettings.musicVolume,
    });
    this.track.play();
    this.playing = key;
  }

  /**
   * Fall silent, over `fade` seconds.
   *
   * Zero — which is what `# music: stop` on its own means — cuts, so the
   * default here is the behaviour a stop had before it could be told otherwise.
   * Fading nothing is not an error: a story may stop music it never started,
   * and there is no sense in waiting five seconds to arrive at the silence it
   * is already in.
   */
  stop(fade = 0): void {
    if (fade > 0 && this.track) this.beginFade(fade);
    else this.cut();
  }

  /** Play what a saved frame was playing, or fall silent if it was silent. */
  restore(name: string | null | undefined, variant: string | null = null): void {
    // Cut rather than fade: a load rebuilds the frame a save was taken on, and
    // a fade is a thing happening *between* frames. One caught mid-fade saved
    // silence, and silence is what it should come back to — immediately.
    if (name) this.play(name, variant);
    else this.cut();
  }

  destroy(): void {
    this.cut();
    this.unsubscribeAudio();
  }

  /**
   * Start the ramp, and hook the clock that runs it.
   *
   * The game's step, not the scene's: `VNScene` is *paused* while the map or a
   * save menu is over it, which would freeze a `scene.tweens` or `scene.time`
   * fade half way down and leave a half-volume drone under the overlay. The
   * track itself keeps playing there for exactly the same reason — the sound
   * manager belongs to the game — so its fade has to keep going too.
   */
  private beginFade(seconds: number): void {
    const level = this.fading?.level ?? 1;
    // Attached once. `on` with the same handler twice would run it twice, and
    // the music would fade at double speed on the second stop.
    if (!this.fading) {
      this.scene.game.events.on(Phaser.Core.Events.POST_STEP, this.stepFade, this);
    }
    this.fading = { level, perSecond: level / seconds };
  }

  /**
   * One frame of the ramp.
   *
   * Linear in amplitude, which is what tweening a volume does everywhere else
   * and what an author asking for five seconds is picturing.
   */
  private stepFade(_time: number, delta: number): void {
    if (!this.fading) return;
    this.fading.level -= this.fading.perSecond * (delta / 1000);
    if (this.fading.level <= 0) {
      // Arrived at silence: the track is now genuinely stopped, and `cut`
      // unhooks this handler as it goes.
      this.cut();
      return;
    }
    this.applyVolume();
  }

  private endFade(): void {
    if (!this.fading) return;
    this.fading = null;
    this.scene.game.events.off(Phaser.Core.Events.POST_STEP, this.stepFade, this);
  }

  /** Silence now, with no ramp: the teardown every other path ends in. */
  private cut(): void {
    // Unhooked first, and unconditionally: the listener is on the *game*, so
    // one left behind outlives the scene that made this player and would go on
    // stepping a fade for a track that no longer exists.
    this.endFade();
    // Destroyed rather than merely stopped: a sound belongs to the game's own
    // manager, not to the scene that added it, so one left behind outlives the
    // scene and the story it was playing under.
    this.track?.destroy();
    this.track = undefined;
    this.playing = null;
  }

  /** The reader's volume, taken down by however far a fade has got. */
  private applyVolume(): void {
    if (!this.track) return;
    setSoundVolume(this.track, AudioSettings.musicVolume * (this.fading?.level ?? 1));
  }
}

/** Phaser's real sound backends expose this, although BaseSound omits it. */
function setSoundVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
  const adjustable = sound as Phaser.Sound.BaseSound & {
    setVolume?: (value: number) => unknown;
  };
  adjustable.setVolume?.(volume);
}
