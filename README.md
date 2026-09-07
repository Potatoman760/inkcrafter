# InkCrafter

A writing environment for visual novels, and the player that runs them.

Stories are written in [ink](https://www.inklestudios.com/ink/), inkle's
narrative scripting language. The ink files are the story — everything else here
exists to make writing them easier and to turn them into something a reader can
play.

This repository holds both halves:

| | |
| --- | --- |
| **[Editor/](Editor/)** | The authoring app. Write and compile ink, plan the story, keep a codex, manage characters, art and music, and preview as you go. |
| **[Player/](Player/)** | The engine that plays what the editor exports. Runs in a browser or as a desktop game. |

They are separate because they do separate jobs. The editor is the only side
that compiles ink or knows what a project folder looks like; the player reads a
finished bundle and knows nothing about how it was made. The two meet at one
shared specification, authored in the editor and copied into the player.

## Getting started

You need [Node.js](https://nodejs.org/) 20 or newer. Then, from this folder:

```bash
npm install
npm run editor
```

That opens the editor. The first launch puts an example project and codex
library in your workspace, so there is something to look at straight away.

To see the player on its own, it needs a game to play. Export one from the
editor into `Player/game/<name>/`, then `npm run player -- <name>`.

## The way through

**Write.** Create a project, write ink, and watch it compile as you type. The
preview plays the scene you are editing. Alongside the writing there is a plan
of acts, chapters and scenes, a codex of characters and places, and catalogues
for stats, inventory, cast, maps, art and music.

**Export.** When there is something to play, the editor writes it out. Three
kinds, all reached from the **File** menu.

**File ▸ Export for player…** offers two of them. A *web bundle* is the compiled
story and its media as one folder, which the player serves — the quick way to
try something. A *desktop game* is a folder per platform, Windows, Linux and
macOS, each holding the story, the player and Electron together. That one runs
on a machine with nothing installed, and is what a Steam depot is made of.

**File ▸ Package project…** writes a zip holding the project itself and the
codex libraries it uses. This is for moving your work to another machine or
handing it to somebody else, and **File ▸ Open a package…** reads one back in.

**Play.** A reader gets saves, rollback, a skip button, a gallery, a world map,
settings that persist, and controller support. On Steam there are achievements
and Cloud saves.

## Where your work lives

Projects and codex libraries live in `Editor/data/` while developing, and in the
per-user application-data folder in a packaged build. That directory is
deliberately not in version control: it holds writing, not source code. Back it
up by packaging a project rather than by copying folders, since a project's
codex libraries sit beside it rather than inside it.

## Commands

Run these from this folder. They fan out to both packages.

| | |
| --- | --- |
| `npm run editor` | The editor, with hot reload |
| `npm run player` | The player's dev server |
| `npm run typecheck` | Type-check everything |
| `npm test` | The test suite |
| `npm run build` | Production builds of both |

Each package has more of its own. See **[Editor/README.md](Editor/README.md)**
and **[Player/README.md](Player/README.md)**.

## Going further

- **[Editor/README.md](Editor/README.md)** — the editor in full, including
  release protection and the command-line exporter.
- **[Editor/ARCHITECTURE.md](Editor/ARCHITECTURE.md)** — how it is put together,
  the file formats, and why the pieces are where they are.
- **[Player/README.md](Player/README.md)** — what a reader gets, the controls,
  and desktop and Steam builds.
- **[Editor/AGENTS.md](Editor/AGENTS.md)** and **[Player/Agents.md](Player/Agents.md)**
  — the contributor checklists. Read these before changing code.

## License

MIT.
