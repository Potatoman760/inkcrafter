import Phaser from "phaser";
import type { AssetIndex } from "@/bundle/AssetIndex";
import { AudioSettings } from "@/audio/AudioSettings";

/**
 * One-shot authored sound cues.
 *
 * Unlike music, a cue is an event: every `# sound:` starts a fresh instance,
 * several cues may overlap, and none belongs in saved scene state. The tag is
 * attached to an ink continuation, so VNScene calls this immediately before it
 * presents that continuation's paragraph.
 */
export class SoundPlayer {
  private readonly scene: Phaser.Scene;
  private readonly assets: AssetIndex;
  private readonly active = new Set<Phaser.Sound.BaseSound>();
  private readonly unsubscribeAudio: () => void;

  constructor(scene: Phaser.Scene, assets: AssetIndex) {
    this.scene = scene;
    this.assets = assets;
    this.unsubscribeAudio = AudioSettings.subscribe(() => {
      for (const cue of this.active) setSoundVolume(cue, AudioSettings.sfxVolume);
    });
  }

  play(name: string, variant: string | null = null): void {
    const key = this.assets.resolve("sound", name, variant)?.key;
    if (!key) {
      console.warn(`Unknown sound "${variant === null ? name : `${name}/${variant}`}"`);
      return;
    }

    const cue = this.scene.sound.add(key, {
      loop: false,
      volume: AudioSettings.sfxVolume,
    });
    this.active.add(cue);
    cue.once(Phaser.Sound.Events.COMPLETE, () => {
      this.active.delete(cue);
      cue.destroy();
    });
    cue.play();
  }

  destroy(): void {
    this.unsubscribeAudio();
    for (const cue of this.active) cue.destroy();
    this.active.clear();
  }
}

/** Phaser's real sound backends expose this, although BaseSound omits it. */
function setSoundVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
  const adjustable = sound as Phaser.Sound.BaseSound & {
    setVolume?: (value: number) => unknown;
  };
  adjustable.setVolume?.(volume);
}
