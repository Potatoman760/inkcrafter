import Phaser from 'phaser';
import { SceneKey } from '@/config/gameConfig';
import { makeButton } from '@/ui/Button';

/** Missing or unsupported encounters have their own exit, independent of any plugin. */
export class MissingMinigameScene extends Phaser.Scene {
  constructor() { super('MissingMinigame'); }

  create(data: { name: string; mode: 'story' | 'test' }): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x05060a, 0.96);
    this.add.text(width / 2, height / 2 - 40, `Cannot load minigame: ${data.name}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#cfd8ee',
    }).setOrigin(0.5);
    makeButton(this, width / 2, height / 2 + 40, 'Return', () => {
      if (data.mode === 'story') {
        this.scene.stop();
        this.scene.resume(SceneKey.VN);
      } else this.scene.start(SceneKey.MainMenu);
    });
  }
}
