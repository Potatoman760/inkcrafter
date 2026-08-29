import { app, BrowserWindow, ipcMain, net, powerMonitor, protocol } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

type StoredValues = Record<string, string>;
type SteamClient = {
  localplayer: { getName(): string };
  utils: { getAppId(): number; isSteamRunningOnSteamDeck(): boolean };
  cloud: {
    isEnabledForAccount(): boolean;
    isEnabledForApp(): boolean;
    fileExists(name: string): boolean;
    readFile(name: string): string;
    writeFile(name: string, content: string): boolean;
  };
  achievement: {
    isActivated(apiName: string): boolean;
    activate(apiName: string): boolean;
  };
  runCallbacks?(): void;
};
type SteamworksModule = {
  init(appId?: number): SteamClient;
  restartAppIfNecessary(appId: number): boolean;
  electronEnableSteamOverlay(disableEachFrameInvalidation?: boolean): void;
};

let mainWindow: BrowserWindow | null = null;
let values: StoredValues = {};
let revision = 0;
let writeQueue = Promise.resolve();
let steamClient: SteamClient | null = null;
let steamError: string | null = null;
let callbackTimer: NodeJS.Timeout | null = null;
let readyToQuit = false;
let relaunchingThroughSteam = false;

const dataFile = (): string => join(app.getPath("userData"), "player-data.json");
const backupFile = (): string => join(app.getPath("userData"), "player-data.backup.json");
const logFile = (): string => join(app.getPath("logs"), "player.log");

protocol.registerSchemesAsPrivileged([{
  scheme: "inkcrafter",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

const appId = readSteamAppId();
const steamworks = loadSteamworks();
if (steamworks && appId !== null) {
  try {
    relaunchingThroughSteam = steamworks.restartAppIfNecessary(appId);
    if (relaunchingThroughSteam) {
      app.quit();
    } else {
      steamworks.electronEnableSteamOverlay();
      steamClient = steamworks.init(appId);
    }
  } catch (error) {
    steamError = error instanceof Error ? error.message : String(error);
  }
}

void app.whenReady().then(async () => {
  if (relaunchingThroughSteam) return;
  registerAppProtocol();
  values = await loadValues();
  registerIpc();
  createWindow();
  if (steamClient?.runCallbacks) callbackTimer = setInterval(() => steamClient?.runCallbacks?.(), 16);

  powerMonitor.on("suspend", () => mainWindow?.webContents.send("app:suspended", true));
  powerMonitor.on("resume", () => mainWindow?.webContents.send("app:suspended", false));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", (event) => {
  if (readyToQuit) return;
  event.preventDefault();
  void queuePersist().finally(() => {
    readyToQuit = true;
    app.quit();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
  if (callbackTimer) clearInterval(callbackTimer);
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#05060a",
    fullscreen: app.isPackaged,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("enter-full-screen", () => mainWindow?.webContents.send("display:fullscreen", true));
  mainWindow.on("leave-full-screen", () => mainWindow?.webContents.send("display:fullscreen", false));
  mainWindow.on("blur", () => mainWindow?.webContents.send("app:suspended", true));
  mainWindow.on("focus", () => mainWindow?.webContents.send("app:suspended", false));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    void appendLog(`[${new Date().toISOString()}] ERROR load ${code} ${description} ${url}\n`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) {
      void appendLog(`[${new Date().toISOString()}] RENDERER-${level} ${message}\n`);
    }
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (current && new URL(url).origin !== new URL(current).origin) event.preventDefault();
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.alt && input.key === "Enter") {
      event.preventDefault();
      mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  const devUrl = process.env["INKCRAFTER_PLAYER_DEV_URL"];
  if (devUrl) {
    const game = commandLineGame();
    const url = new URL(devUrl);
    if (game) url.searchParams.set("game", game);
    void mainWindow.loadURL(url.href);
  } else {
    const query = commandLineGame() ? { query: { game: commandLineGame()! } } : undefined;
    const url = new URL("inkcrafter://app/index.html");
    if (query?.query.game) url.searchParams.set("game", query.query.game);
    void mainWindow.loadURL(url.href);
  }
}

function registerAppProtocol(): void {
  const root = resolve(__dirname, "..", "dist");
  protocol.handle("inkcrafter", (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
    const file = resolve(root, pathname || "index.html");
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(file).href);
  });
}

function registerIpc(): void {
  ipcMain.handle("storage:load", () => values);
  ipcMain.handle("storage:set", async (_event, key: string, value: string) => {
    values[key] = value;
    await queuePersist();
  });
  ipcMain.handle("storage:remove", async (_event, key: string) => {
    delete values[key];
    await queuePersist();
  });
  ipcMain.handle("storage:flush", () => queuePersist());
  ipcMain.handle("display:is-fullscreen", () => mainWindow?.isFullScreen() ?? false);
  ipcMain.handle("display:set-fullscreen", (_event, value: boolean) => {
    mainWindow?.setFullScreen(value);
    return mainWindow?.isFullScreen() ?? value;
  });
  ipcMain.handle("display:toggle-fullscreen", () => {
    const next = !(mainWindow?.isFullScreen() ?? false);
    mainWindow?.setFullScreen(next);
    return next;
  });
  ipcMain.handle("steam:unlock-achievement", (_event, apiName: string) => {
    if (!/^[A-Za-z0-9_]+$/.test(apiName) || !steamClient) return false;
    try {
      if (steamClient.achievement.isActivated(apiName)) return true;
      return steamClient.achievement.activate(apiName);
    } catch (error) {
      void appendLog(
        `[${new Date().toISOString()}] WARN Steam achievement ${apiName}: ${String(error)}\n`,
      );
      return false;
    }
  });
  ipcMain.handle("app:info", () => ({
    desktop: true as const,
    packaged: app.isPackaged,
    version: app.getVersion(),
    dataPath: app.getPath("userData"),
    steam: {
      available: steamClient !== null,
      appId: steamClient?.utils.getAppId() ?? appId,
      playerName: steamClient?.localplayer.getName() ?? null,
      deck: steamClient?.utils.isSteamRunningOnSteamDeck() ?? false,
      cloud: Boolean(steamClient?.cloud.isEnabledForAccount() && steamClient.cloud.isEnabledForApp()),
      error: steamError,
    },
  }));
  ipcMain.on("app:quit", () => app.quit());
  ipcMain.on("app:report", (_event, level: string, message: string) => {
    void appendLog(`[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`);
  });
}

async function loadValues(): Promise<StoredValues> {
  const candidates: Array<{ revision: number; values: StoredValues }> = [];
  for (const file of [dataFile(), backupFile()]) {
    try {
      const parsed = parseStored(await readFile(file, "utf8"));
      if (parsed) candidates.push(parsed);
    } catch {
      // Try the backup; a first launch has neither file.
    }
  }
  if (steamCloudAvailable() && steamClient?.cloud.fileExists("inkcrafter-player-data.json")) {
    try {
      const parsed = parseStored(steamClient.cloud.readFile("inkcrafter-player-data.json"));
      if (parsed) candidates.push(parsed);
    } catch (error) {
      steamError ??= `Steam Cloud read failed: ${String(error)}`;
    }
  }
  const newest = candidates.sort((a, b) => b.revision - a.revision)[0];
  revision = newest?.revision ?? 0;
  return newest?.values ?? {};
}

function queuePersist(): Promise<void> {
  writeQueue = writeQueue.then(persist, persist);
  return writeQueue;
}

async function persist(): Promise<void> {
  const folder = app.getPath("userData");
  await mkdir(folder, { recursive: true });
  revision = Math.max(Date.now(), revision + 1);
  const body = JSON.stringify({ revision, values }, null, 2);
  const temporary = join(folder, `player-data.${process.pid}.tmp`);
  await writeFile(temporary, body, "utf8");
  await rm(backupFile(), { force: true });
  if (existsSync(dataFile())) await rename(dataFile(), backupFile());
  try {
    await rename(temporary, dataFile());
  } catch (error) {
    if (existsSync(backupFile()) && !existsSync(dataFile())) await rename(backupFile(), dataFile());
    throw error;
  }
  if (steamCloudAvailable() && !steamClient?.cloud.writeFile("inkcrafter-player-data.json", body)) {
    throw new Error("Steam Cloud refused the player-data write.");
  }
}

function parseStored(body: string): { revision: number; values: StoredValues } | null {
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record["revision"] === "number" && record["values"] && typeof record["values"] === "object") {
    return { revision: record["revision"], values: record["values"] as StoredValues };
  }
  return { revision: 0, values: record as StoredValues };
}

function steamCloudAvailable(): boolean {
  return Boolean(steamClient?.cloud.isEnabledForAccount() && steamClient.cloud.isEnabledForApp());
}

async function appendLog(line: string): Promise<void> {
  await mkdir(app.getPath("logs"), { recursive: true });
  const existing = await readFile(logFile(), "utf8").catch(() => "");
  await writeFile(logFile(), `${existing.slice(-500_000)}${line}`, "utf8");
}

function commandLineGame(): string | null {
  const value = process.argv.find((arg) => arg.startsWith("--game="))?.slice(7) ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : null;
}

function readSteamAppId(): number | null {
  const fromEnvironment = Number(process.env["STEAM_APP_ID"]);
  if (Number.isInteger(fromEnvironment) && fromEnvironment > 0) return fromEnvironment;
  for (const file of [resolve("steam_appid.txt"), join(process.resourcesPath, "steam_appid.txt")]) {
    try {
      const value = Number(readFileSync(file, "utf8").trim());
      if (Number.isInteger(value) && value > 0) return value;
    } catch {
      // Steam is optional in normal desktop and browser development.
    }
  }
  return null;
}

function loadSteamworks(): SteamworksModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("steamworks.js") as SteamworksModule;
  } catch (error) {
    steamError = error instanceof Error ? error.message : String(error);
    return null;
  }
}
