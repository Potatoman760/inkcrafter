import Phaser from "phaser";
import { desktopBridge } from "@/platform/desktop";
import { PlayerStorage } from "@/platform/Storage";

/** Pause time, video, and audio while the app is suspended or fully hidden. */
export function installLifecycleHandling(game: Phaser.Game): void {
  let suspended = false;
  const pausedVideos = new Set<Phaser.GameObjects.Video>();
  const apply = (next: boolean): void => {
    if (suspended === next) return;
    suspended = next;
    if (next) {
      for (const scene of game.scene.getScenes(false)) {
        for (const object of scene.children.list) {
          if (object instanceof Phaser.GameObjects.Video && object.isPlaying() && !object.isPaused()) {
            object.setPaused(true);
            pausedVideos.add(object);
          }
        }
      }
      game.loop.sleep();
      game.sound.pauseAll();
      void PlayerStorage.flush();
    } else {
      for (const video of pausedVideos) {
        if (video.active) video.setPaused(false);
      }
      pausedVideos.clear();
      game.sound.resumeAll();
      game.loop.wake();
    }
  };

  document.addEventListener("visibilitychange", () => apply(document.hidden));
  desktopBridge()?.app.onSuspended(apply);
  window.addEventListener("pagehide", () => void PlayerStorage.flush());
}
