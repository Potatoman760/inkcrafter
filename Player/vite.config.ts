import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

function releaseKeys(): Record<string, string> {
  try {
    const file = fileURLToPath(new URL("./.inkcrafter/release-keys.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown; keys?: unknown };
    return parsed.version === 1 && parsed.keys && typeof parsed.keys === "object"
      ? parsed.keys as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

// Vite config for the InkCrafter visual-novel player.
// - `@` alias maps to `src/` (mirrors tsconfig paths).
// - The static root is `game/`, not the conventional `public/`: everything
//   outside it is engine, and each folder inside it is a whole game exported by
//   InkCrafter. Vite serves the static root's *contents* at `/`, so
//   `game/game1/` is `/game1/` in dev and `dist/game1/` in a build — which is
//   exactly the base URL `loadBundle` resolves a game id to.
export default defineConfig({
  // Relative URLs make the same renderer work from Electron's file:// origin.
  base: "./",
  define: {
    __INKCRAFTER_RELEASE_KEYS__: JSON.stringify(releaseKeys()),
  },
  publicDir: "game",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    open: true,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
