export interface DesktopInfo {
  desktop: true;
  packaged: boolean;
  version: string;
  dataPath: string;
  steam: {
    available: boolean;
    appId: number | null;
    playerName: string | null;
    deck: boolean;
    cloud: boolean;
    error: string | null;
  };
}

export interface DesktopBridge {
  storage: {
    load(): Promise<Record<string, string>>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    flush(): Promise<void>;
  };
  display: {
    isFullscreen(): Promise<boolean>;
    setFullscreen(value: boolean): Promise<boolean>;
    toggleFullscreen(): Promise<boolean>;
    onFullscreenChanged(listener: (value: boolean) => void): () => void;
  };
  steam: {
    /** Activate a Steamworks achievement, or report that Steam is unavailable. */
    unlockAchievement(apiName: string): Promise<boolean>;
  };
  app: {
    info(): Promise<DesktopInfo>;
    quit(): void;
    report(level: "info" | "warn" | "error", message: string): void;
    onSuspended(listener: (suspended: boolean) => void): () => void;
  };
}

declare global {
  interface Window {
    inkcrafterDesktop?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | null {
  return window.inkcrafterDesktop ?? null;
}
