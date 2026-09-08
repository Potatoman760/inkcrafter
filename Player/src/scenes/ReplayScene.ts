import { SceneKey } from '@/config/gameConfig';
import { VNScene } from '@/scenes/VNScene';

/** A second VN scene key lets a disposable Ink state play over the paused live story. */
export class ReplayScene extends VNScene {
  constructor() { super(SceneKey.Replay); }
}
