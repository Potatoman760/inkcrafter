import { desktopBridge } from "@/platform/desktop";

let desktopValues: Map<string, string> | null = null;
let pending = Promise.resolve();

/**
 * A synchronous key/value view backed by localStorage in a browser and by an
 * atomic JSON file in the desktop host. Desktop data is loaded before Phaser
 * starts, so scenes never need asynchronous save APIs.
 */
export const PlayerStorage = {
  async initialize(): Promise<void> {
    const bridge = desktopBridge();
    if (!bridge) return;
    desktopValues = new Map(Object.entries(await bridge.storage.load()));
  },

  getItem(key: string): string | null {
    if (desktopValues) return desktopValues.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (desktopValues) {
      desktopValues.set(key, value);
      const bridge = desktopBridge();
      if (bridge) pending = pending.then(() => bridge.storage.set(key, value)).catch(reportWrite);
      return;
    }
    localStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    if (desktopValues) {
      desktopValues.delete(key);
      const bridge = desktopBridge();
      if (bridge) pending = pending.then(() => bridge.storage.remove(key)).catch(reportWrite);
      return;
    }
    localStorage.removeItem(key);
  },

  async flush(): Promise<void> {
    await pending;
    await desktopBridge()?.storage.flush();
  },
};

function reportWrite(error: unknown): void {
  console.error("Could not persist player data.", error);
  desktopBridge()?.app.report("error", `Could not persist player data: ${String(error)}`);
}

