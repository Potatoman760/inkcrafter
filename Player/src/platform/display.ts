import { desktopBridge } from "@/platform/desktop";

export const DisplayControl = {
  async isFullscreen(): Promise<boolean> {
    const desktop = desktopBridge();
    if (desktop) return desktop.display.isFullscreen();
    return document.fullscreenElement !== null;
  },

  async setFullscreen(value: boolean): Promise<boolean> {
    const desktop = desktopBridge();
    if (desktop) return desktop.display.setFullscreen(value);
    if (value && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!value && document.fullscreenElement) await document.exitFullscreen();
    return document.fullscreenElement !== null;
  },

  async toggleFullscreen(): Promise<boolean> {
    const desktop = desktopBridge();
    if (desktop) return desktop.display.toggleFullscreen();
    return this.setFullscreen(document.fullscreenElement === null);
  },
};

window.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "Enter") {
    event.preventDefault();
    void DisplayControl.toggleFullscreen();
  }
});

