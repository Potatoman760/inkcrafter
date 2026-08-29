import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = join(root, "node_modules", "vite", "bin", "vite.js");
const electron = join(root, "node_modules", "electron", "cli.js");
const args = process.argv.slice(2);
const gameAt = args.findIndex((arg) => arg === "--game" || arg === "-g");
const game = args.find((arg) => arg.startsWith("--game="))?.slice(7) ?? (gameAt >= 0 ? args[gameAt + 1] : null);
const port = 5173;

const server = spawn(process.execPath, [vite, "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_GAME: game ?? process.env["VITE_GAME"] ?? "" },
});

for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    if (response.ok) break;
  } catch {
    await wait(100);
  }
}

const electronArgs = [".", ...(game ? [`--game=${game}`] : [])];
const desktop = spawn(process.execPath, [electron, ...electronArgs], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, INKCRAFTER_PLAYER_DEV_URL: `http://127.0.0.1:${port}/` },
});

const stop = (): void => {
  server.kill();
  desktop.kill();
};
desktop.on("exit", (code) => {
  server.kill();
  process.exit(code ?? 0);
});
server.on("exit", (code) => {
  desktop.kill();
  if (code) process.exit(code);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

