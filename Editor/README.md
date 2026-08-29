# InkCrafter

InkCrafter is a desktop writing environment for visual novels built with
[ink](https://www.inklestudios.com/ink/), inkle's narrative scripting language.
It keeps the story source at the center while bringing the surrounding work—the
story plan, codex, characters, media, variables, playtesting, and AI-assisted
editing—into one application.

Ink files remain the source of truth. InkCrafter compiles and previews them as
you work, then exports a game-ready bundle containing the compiled story and its
catalogues and media.

## What it includes

- An ink-aware editor with whole-story compilation and inline diagnostics
- A manuscript view for reading and revising a path through the story
- A guarded Act → Chapter → Scene plan, with one Ink file per Scene
- A reusable codex for characters, locations, items, lore, and routes
- Game data for player-visible stats, hidden vars, inventory, cast, maps, media
  effects, and Steam achievements
- A playable preview that follows the scene currently being edited
- An AI assistant that understands the open work and can safely read and update
  project files
- Bundle export for a standalone player

## Run it locally

You need a current version of [Node.js](https://nodejs.org/) and npm.

```bash
npm install
npm run dev
```

The first launch adds an example project and codex library to the local
workspace, so you can explore the application immediately.

### Production build

```bash
npm run build
npm start
```

`npm run build` writes the application to `out/`. To create a distributable
package instead, run:

```bash
npm run dist
```

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Electron with hot reload |
| `npm run typecheck` | Type-check the main, preload, and renderer code |
| `npm run test` | Run the test suite once |
| `npm run build` | Build the production application into `out/` |
| `npm start` | Run the production build |
| `npm run dist` | Build and package the desktop application |
| `npm run export -- --project <dir> --out <dir>` | Export a project bundle without opening Electron |

Before submitting a code change, run:

```bash
npm run typecheck
npm run test
npx electron-vite build
```

### Protecting a release

Project settings can enable **Content protection** for release exports. InkCrafter
generates a release key, stores its private half in the operating system's secure
storage, and installs that private key into a connected InkCrafter Player checkout.
Restart the player's development server—or rebuild the player—after installing a
key. Protected exports encrypt story data and media; editor previews remain plain
so they start quickly.

This is practical asset obfuscation, not DRM: it keeps ordinary files out of a
shipped game, but a determined person can still recover data that the player is
able to decrypt. The command-line exporter follows the project's setting; add
`--plain` when a plain diagnostic export is needed.

## Where your work lives

During development, projects and codex libraries live under `data/`. That
directory is intentionally gitignored: it contains writing, not source code.
Packaged builds use Electron's per-user application-data directory instead.

The authored project files include the ink source plus readable metadata such
as `project.md`, `plan.json`, `stats.json`, `media.json`, `gallery.json`, and
`achievements.json`. Steam achievements are edited under Game → Steam and unlock
when a chosen Ink global matches the authored condition. Some files, notably
`ink/state.ink` and `export/catalogue.json`, are generated from that metadata and
should not be edited by hand.

## Documentation

- [Architecture and design notes](ARCHITECTURE.md) explains the application
  model, file formats, process boundaries, and important implementation choices.
- [AGENTS.md](AGENTS.md) is the contributor checklist, including repository
  rules, testing expectations, and bundle details.
- [Examples](examples/) contains the sample project and codex data copied into a
  new workspace.

## Troubleshooting

If Electron fails with `Cannot read properties of undefined (reading
'whenReady')`, your shell may have `ELECTRON_RUN_AS_NODE` set. In PowerShell,
clear it before starting the app:

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

If Electron reports `Electron uninstall`, its binary may not have downloaded
during installation. Run:

```bash
node node_modules/electron/install.js
```

## License

MIT
