import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env["npm_execpath"];
if (!npmCli) throw new Error("Run desktop packaging through npm.");

const args = process.argv.slice(2);
const directoryOnly = args.shift() === "--dir";
let game = null;
const builderArgs = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--game" || arg === "-g") {
    game = args[index + 1] ?? null;
    index += 1;
  } else if (arg.startsWith("--game=")) {
    game = arg.slice(7);
  } else {
    builderArgs.push(arg);
  }
}

await run(process.execPath, [npmCli, "run", "build", ...(game ? ["--", "--game", game] : [])]);
await run(process.execPath, [npmCli, "run", "desktop:compile"]);
await run(process.execPath, [
  join(root, "node_modules", "electron-builder", "cli.js"),
  ...(directoryOnly ? ["--dir"] : []),
  ...builderArgs,
]);

function run(command, argv) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, argv, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`Command failed (${code ?? 1}).`)));
  });
}
