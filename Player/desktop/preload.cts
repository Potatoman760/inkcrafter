import { contextBridge, ipcRenderer } from "electron";

const listen = <T,>(channel: string, listener: (value: T) => void): (() => void) => {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld("inkcrafterDesktop", {
  storage: {
    load: () => ipcRenderer.invoke("storage:load"),
    set: (key: string, value: string) => ipcRenderer.invoke("storage:set", key, value),
    remove: (key: string) => ipcRenderer.invoke("storage:remove", key),
    flush: () => ipcRenderer.invoke("storage:flush"),
  },
  display: {
    isFullscreen: () => ipcRenderer.invoke("display:is-fullscreen"),
    setFullscreen: (value: boolean) => ipcRenderer.invoke("display:set-fullscreen", value),
    toggleFullscreen: () => ipcRenderer.invoke("display:toggle-fullscreen"),
    onFullscreenChanged: (listener: (value: boolean) => void) => listen("display:fullscreen", listener),
  },
  steam: {
    unlockAchievement: (apiName: string) => ipcRenderer.invoke("steam:unlock-achievement", apiName),
  },
  app: {
    info: () => ipcRenderer.invoke("app:info"),
    quit: () => ipcRenderer.send("app:quit"),
    report: (level: string, message: string) => ipcRenderer.send("app:report", level, message),
    onSuspended: (listener: (suspended: boolean) => void) => listen("app:suspended", listener),
  },
});
