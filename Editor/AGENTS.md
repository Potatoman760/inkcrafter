# AGENTS.md

Working notes for AI agents in this repo. The [README](README.md) explains what
InkCrafter does and why; this file is about how to change it without breaking
things. Where the two overlap, the README is the prose and this is the checklist.

## What this is

InkCrafter is a desktop authoring tool for **visual novels written in
[ink](https://github.com/inkle/ink)**. It is an Electron app that edits ink
source, plays the compiled story, plans the story's structure, keeps a codex of
world material, manages stats/items and character/background media, and can call
a model to draft prose or ink.

The output is **ink files on disk**, meant to be compiled and rendered by
`inkjs` inside a game. Everything else the app writes — the plan, the catalogue,
the media index — is metadata around that.

It also *exports* those files as a **bundle**: one folder a game can fetch and
run, holding compiled story JSON and every catalogue beside it. The game that
reads it is [Maculate Conception](../Maculate-Conception), a Phaser player in a
sibling checkout. See [The bundle](#the-bundle).

## Commands

Run these from `Editor/`. The editor is one half of a two-package monorepo — the
other is `Player/`, which runs what the editor exports — and the workspace root
above adds `npm run typecheck`, `test` and `build` that fan out to both through
Turborepo, with a task cache. Either way in works; the root is the one that
catches a change here breaking the player.

| | |
| --- | --- |
| `npm run dev` | dev server. Renderer edits hot-swap; main, preload and `shared/` rebuild and **restart the app**, which is what `--watch` buys |
| `npm run test` | vitest, one pass, ~830 tests in ~6s |
| `npm run typecheck` | both tsconfigs — **run this; `npm run test` does not typecheck** |
| `npm run build` | production build into `out/` |
| `npm run dist` | build + electron-builder installer |
| `npm run export -- --project <dir> --out <dir>` | write a bundle, no Electron needed |

Before calling work done: `npm run typecheck`, `npm run test`, then
`npx electron-vite build`. If the change touches anything the renderer imports,
launch it too — see [Verifying against the real thing](#verifying-against-the-real-thing).

A restart loses the open file and any unsaved buffer, so a main-process change
mid-edit costs the buffer. `data/` is excluded from the dev watcher: it is the
author's workspace, written by the app itself, and a story saved in the editor
is not a source change.

There is no linter and no formatter. Match the surrounding file.

## Layout

```
src/
  main/       Electron main — all file I/O, ink compilation, model calls
    ai/       prompts, tool definitions, the assistant loop
    codex/    library store and entry markdown
    ink/      inkjs compiler wrapper and diagnostic parsing
    manuscript/  the read-through: compose, pathfind, session state
  preload/    contextBridge surface — the only renderer to main channel
  renderer/   React UI, one directory per feature
  shared/     Types crossing IPC, plus pure logic both sides need
  test/       setup and the window.inkcrafter stub
```

Import aliases, configured in all of `electron.vite.config.ts`,
`vitest.config.ts` and the two tsconfigs: `@shared/*` for `src/shared/*`, `@/*`
for `src/renderer/src/*` (renderer only).

**`shared/` may not import from `main/` or `renderer/`.** It is the layer both
sides depend on, so a type that main needs and the renderer displays is
*declared in shared* and imported by main — not the other way around. This has
been violated once and caught in review.

## Editor mode

InkCrafter has an assistant inside it that builds stories in the author's
workspace. **Editor mode is that same job done from outside** — by a tool with a
filesystem where the assistant has an IPC bridge. Its instructions are the ones
to follow here too, and they are files rather than lore:

| | |
| --- | --- |
| [prompts/assistant.md](src/main/ai/prompts/assistant.md) | working in a workspace: which tool owns what, every file format with a worked example, the ink rules |
| [prompts/prose.md](src/main/ai/prompts/prose.md) | drafting prose for one section |
| [prompts/ink.md](src/main/ai/prompts/ink.md) | writing ink |

These are the shipped defaults themselves, not a description of them. Each is
inlined into the main bundle at build time with `?raw`, so the markdown *is* the
prompt — edit it and the model is sent something different. Read
`assistant.md` before working on a project's contents; it is the same briefing
the in-app assistant gets.

Where editor mode differs from the assistant, and what to do instead:

- **No tools.** It calls `write_plan`, `write_variables`, `write_cast`,
  `write_media`, `write_map`; you edit `plan.json`, `stats.json`, `npcs.json`,
  `media.json`, `map.json` by hand. Every rule those tools enforce still holds —
  they are written out in `assistant.md` — and nothing is enforcing them for you.
- **`ink/state.ink` is generated**, from `stats.json` and `npcs.json`. The tools
  regenerate it; editing it by hand is lost at the next save. After changing
  either catalogue, regenerate with `renderStateInk` from
  [statsInk.ts](src/shared/statsInk.ts) rather than editing the declarations.
- **Ids are minted, never invented** — `newId` in [ids.ts](src/shared/ids.ts).
  The tools mint their own; you have to remember to.
- **Nothing checks your work as you go.** The assistant's tools validate on the
  way in — that a media file is really in `media/`, that a map target is really
  a knot. Run the project check instead: it is the same `preflight` the export
  runs, and it is in the editor's Debug tab.

## Words in the UI

Short. A control is a control, not a sentence explaining itself. The rule is
already written in [Field.tsx](src/renderer/src/design/components/Field.tsx) and
worth repeating because it is easy to break while being helpful:

- **Buttons, tabs and labels are one or two words.** "Run check", not "Run a
  full check of the project".
- **`note` is a fact the app worked out** — `seraphine.md`, `3 unfiled`,
  `2 errors across 37 files`. Something that changes, and is worth a glance.
- **`about` is the teaching**, behind the info mark beside a label. Read once,
  then never again. A paragraph that would be `about` does not go on the page
  because the page has no room to say it every time.
- **`hint` is one line and states a consequence**, not the label again.
- **Nothing at all is a valid answer.** A button that says what it does needs no
  sentence under it saying the same thing at greater length. Empty states and
  errors are the exception: there, the words are all there is.

The failure this catches: a Run button captioned "Compiles the whole story and
checks every tag against the catalogues." Twelve words explaining a two-word
button, permanently on screen, in a pane 300px wide.

## Rules that came from bugs

Each of these cost something. They are not style preferences.

**Never write ink the compiler would reject.** ink files are the only artefact
anyone else reads. An edit that "looks like ink" and does not compile is a
corrupted save. Every edit-producing function has tests that run the result
through `Compiler` from `inkjs` — see
[src/main/inkEdits.test.ts](src/main/inkEdits.test.ts).

**Verify claims about ink against the compiler, not from memory.** ink's actual
behaviour has surprised this codebase repeatedly: tags are inert opaque strings
that change no variable, `Choice.tags` comes back empty where you would expect
it populated, `>` is legal in prose, and `INCLUDE chapter1` resolves literally
rather than gaining a `.ink`. Write a probe, run it, then write the code.

**Compose conditions; never parse them.** Adding a second gate to `{a}` produces
`{a and b}` by carrying the existing text across as a substring, so a
hand-written `{inventory ? shovel and LIST_COUNT(pack) < 3}` survives exactly.
Nothing takes an author's expression apart.

**Parse only what you wrote.** Where reading back *is* the feature —
`parseEffect` in [inkEdits.ts](src/shared/inkEdits.ts) — recognise exactly the
shapes the renderers produce and return `null` for everything else, so
`~ trust = trust + roll(6)` stays untouched. A property test asserts every
renderer output parses back identically; the reader and the writers drifting
apart would quietly halve the feature rather than fail.

**Compile the whole story, not the open file.** A file with an `INCLUDE`, or a
divert leading out of it, does not compile alone. Compilation lives in main
because it needs the filesystem to resolve includes.

**Changes go out as tags; gates go out as ink.** Only ink can branch, so a gate
is `{abeline_affection >= 2}`. But only the game knows affection stops at ten, so
a change is `# npc: abeline affection +2` and `NpcManager` clamps it and writes
the result back into the variable. A player stat has a manager only when it is a
number — `# stat:` carries an integer — so a yes/no stays `~ has_met_wren = true`,
and items stay `~ inventory += shovel` because ink owns the `LIST`. Which is
which is derived in [trackables.ts](src/shared/trackables.ts) and stored nowhere;
add a case there rather than branching on `kind` at a call site.

**A standalone tag lands on the *next text line*.** That is silently wrong when
the next thing the reader sees is the branch that reads the variable: the gate is
evaluated before the tag reaches anyone, and the value is correct immediately
afterwards, which is what makes it invisible. One line of prose fixes it,
`preflight` warns about it, and both arrangements are
[run against the compiler](src/main/stateTags.compile.test.ts). The same rule is
why a media tag goes *above* the line it governs.

**The preview and the player must apply tags identically.** A gate that opens in
one and not the other is a preview lying about the game. They are *separate*
implementations — `applyChange` in `trackables.ts` here, `StatsManager` /
`NpcManager` in the player — because `trackables.ts` is editor-side and not
synced. So the agreement is held by the compile test rather than by shared code:
change what a tag does on one side and the other has to follow, deliberately.

**The renderer gets no filesystem and no API key.** `contextIsolation` on,
`nodeIntegration` off, `sandbox` on, and a build-time CSP with
`connect-src 'none'`. It renders model output, so it must not be able to reach
the network or the disk. Every path it supplies goes through `safePath` in
[src/main/fs.ts](src/main/fs.ts), validated segment by segment and confirmed to
stay inside its directory before a write.

**The game's data is a view, not a dialog.** Media, stats/items, cast and map
are sections of the **Game** view
([GameManagerView.tsx](src/renderer/src/manager/GameManagerView.tsx)). Each
section is a *panel* — a fragment with no shell of its own — and puts its own
controls at the right of its own tab row. A new catalogue goes in as a section;
do not add a top-level dialog for one.

**The right panel is a dock, not a pane per view.**
[rightDock.ts](src/renderer/src/layout/rightDock.ts) owns the table of which
tabs each view offers and which one survives a change of view. One `rightTab`
in `App`, never a second per-view pane state.

The rule this replaced was *panes belong to one view; dialogs belong to the
window* — earned, because a control that opens a pane is silently dead in the
other views, and that shipped three times. It solved the problem by making
everything reachable a dialog, and the cost was that the assistant, the thing
that should be most present, was a modal covering whatever it had been asked
about. The dock satisfies the same purpose the other way: a tab in every view's
strip cannot be dead in any of them.

What is still a dialog: **configuration and one-off actions** — the app's
settings, the project's, its libraries, the codex entry editor, exporting a
bundle. A settings screen you must navigate away from your work to reach is
worse than one that floats over it.

**Hooks go above every early return.** A `useMemo` below
`if (storyJson === null) return null` changes the hook count between renders and
blanks the whole window. Caught in
[StoryPlayer](src/renderer/src/player/StoryPlayer.tsx); there is a regression
test.

**Ids never change.** `prj_`, `lib_`, `cdx_`, `prv_`, `pln_`, `stt_`, `med_`
plus ten Crockford-base32 characters, from [ids.ts](src/shared/ids.ts). They are
written into the files so paths and titles stay free to be reorganised. Never
derive identity from a path.

## The bundle

`src/main/bundle.ts` turns a project into something a game can run:

```
game/                 the player's static root — one folder per game
  game1/              <out> is one of these; its name is the id `?game=` asks for
    manifest.json     format, contentHash, every knot, every media file to preload
    story.json        Story.ToJson(), compiled with countAllVisits
    catalogue.json    stats and items      media.json  characters, backgrounds, video
    npcs.json         the cast             map.json    places and their gates
    media/…           the files themselves
```

`<out>` is the **game folder, not the folder of games**. Exporting into `game/`
itself puts every file one level too high and the player finds nothing — no
error, a blank page — so `refuseDestination` recognises a folder whose children
are bundles and says so. The folder name is part of the contract: `isGameId` in
`manifest.ts` is what `?game=` will accept.

Rules that hold it together:

- **Compile here, never there.** The player has no compiler and no way to resolve
  an `INCLUDE`. A story with an error is *refused* rather than exported, so a
  bundle that exists is one that runs.
- **`countAllVisits` is not optional.** It is baked into the emitted JSON as a
  per-container flag, so a bundle exported without it can never answer "has the
  reader been here" — and map gates are built on that question.
- **The destination is replaced wholesale**, so `refuseDestination` rejects any
  folder that is neither empty nor already a bundle. It is chosen from a native
  picker; somewhere with a year of work in it is one misclick away.
- **Written to a staging folder and swapped in**, so a crash cannot leave half a
  bundle where a game would find it. `swapIn` renames the old one aside *before*
  moving the new one in and puts it back if that fails — never delete the
  destination first. Doing so cost a whole bundle: on Windows a directory rename
  fails with `EPERM` whenever anything holds the folder open (an editor with the
  repo loaded is enough), and the delete had already succeeded.
- **A held folder falls back to updating files in place.** `mirror` removes what
  is no longer in the bundle, then copies the rest over. Not atomic, and it
  warns as much — but a bundle that cannot be exported at all is worse than one
  a watcher might glimpse mid-update.
- **`preflight` reports what the compiler cannot see**: a tag naming a sprite
  that is not catalogued, a stat that is not in the catalogue, a map target that
  is not a knot. All warnings — a story with one misspelled sprite is still worth
  playing, and half of what it finds is work in progress.

**The desktop export** (`src/main/desktopExport.ts`, `Export… ▸ Desktop game`,
`npm run export -- --desktop`) writes the other kind of release: one folder per
platform holding Electron, the player's build, its Electron main and one
bundle, which runs with nothing installed and is what a Steam depot is made of.
It assembles from Electron's prebuilt zips rather than electron-builder, so
every platform builds on any machine; what it cannot do is sign a Mac build,
and its README says so. The player is **rebuilt every export** — an engine
older than its source would ship a week of fixes short — and a protected
project is refused unless the built engine holds its key, since the key is
compiled in by that build. Everything reaching outside the process (the build,
the download, the unzip) comes in through `DesktopTools`, which is how the
tests run without a network. The shell reads `player.json` in the app folder
for the game id and Steam App ID.

**A project package** (`src/main/projectPackage.ts`, `File ▸ Package project…`
and `File ▸ Open a package…`) is the third thing that leaves this app, and the
only one that comes back. A zip holding `project/`, `codex/<library>/` and a
manifest — the libraries travel with the project because they are siblings in
the workspace rather than inside it, so a project folder copied alone loses its
whole codex. Opening one **never overwrites**: a taken folder name gets a free
one, a project id already in the workspace is reminted (two projects under one
id would share the player's save slots), and a library already here is left
untouched rather than replaced by the sender's copy. Every entry name is
checked before a byte is written — a package can arrive from anybody, and a zip
may name an entry `../../anything`. Media is stored rather than deflated, which
took a nine-hundred-megabyte project from 25s to 3s for four megabytes.

`src/shared/bundle/` is the interchange spec, and it is **copied into the player**
(`src/bundle/spec/`) by a sync script there. It must stay pure — no Electron, no
node, no imports outside `src/shared` — because it is compiled by a second
bundler in a second repo. Changing it means running `npm run spec:sync` in the
player; its build fails on drift.

## The data directory

`data/` is the user's workspace and is **gitignored** — it holds real projects,
not fixtures. Do not commit anything under it, and do not assume it is empty.

Some files in a project are **generated on save and will be overwritten**:

| Path | Generated from |
| --- | --- |
| `ink/state.ink` | `stats.json`, via `renderStateInk` |
| `export/catalogue.json` | `stats.json`, via `buildExport` |

Hand-editing those is pointless. The authored files are `stats.json`,
`plan.json`, `media.json`, `project.md`, `outline.md`, and the ink itself.

`data/projects/*` is also the best test data in the repo — see below.

## Tests

`vitest`, node environment by default. A renderer test opts into a DOM with
`// @vitest-environment jsdom` on the **first line of the file**.

Renderer components talk to main for everything, so
[src/test/harness.ts](src/test/harness.ts) provides a stubbed
`window.inkcrafter` plus fixtures. It is deliberately shallow — those tests are
about what a component does with what it gets back.

Three traps that have each cost a debugging round:

- **Typing into a controlled input whose `onChange` is a bare `vi.fn()` does
  nothing.** The value never updates, so the assertion ends up testing the
  fixture. Wrap it in a small stateful host component.
- **Fixtures agree with whatever you imagined.** Running the plan's knot
  resolution over the real `data/projects/the-lighthouse` is what revealed all
  fifteen scenes resolving to nothing — a hand-built fixture had quietly assumed
  each scene owned its ink file. Where a feature reads real files, point a test
  at real files.
- **`noUncheckedIndexedAccess` is on** in both tsconfigs. `array[i]` is
  `T | undefined` and that is deliberate: typing it as present hid a crash that
  shipped. Handle it or assert it; do not widen the config.

## Verifying against the real thing

Two probe recipes, both used throughout this codebase's history.

**A logic probe** — build a scratch TS file with `npx esbuild`, run it under
`node` (or `npx electron` when it needs Electron APIs), assert, delete it. This
is how questions about inkjs get settled.

**A launch probe** — boot the built app and read the live DOM:

```js
// launch-probe.cjs, in the project root so require('electron') resolves
const { app, BrowserWindow } = require('electron')
setTimeout(() => { console.log('hard timeout'); app.exit(2) }, 40000)
require(require('path').join(__dirname, 'out/main/index.js'))

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 8000))
  const win = BrowserWindow.getAllWindows()[0]
  const size = await win.webContents.executeJavaScript(
    'document.getElementById("root").innerHTML.length'
  )
  console.log('PROBE: ' + size)
  app.exit(0)
})
```

```sh
npx electron-vite build && env -u ELECTRON_RUN_AS_NODE npx electron ./launch-probe.cjs
```

Two gotchas. The probe must live in the project root or `require('electron')`
fails to resolve. And `ELECTRON_RUN_AS_NODE` is set in some shells here — clear
it with `env -u`, since setting it to empty is not the same as unsetting it.
Always give the probe a hard `app.exit` timeout; a window that opens and waits
will hang the tool call. `webContents.capturePage()` works the same way when the
question is visual rather than structural.

## Environment

Windows, with PowerShell primary and Bash (Git Bash) also available — each takes
its own syntax.

**Never write a file with a Bash heredoc here** — no `cat > file <<'EOF'`, not
even with the quoted delimiter that is supposed to make it literal. Use the Write
tool for new files and Edit for changes to existing ones.

Every other heredoc use is fine: piping a query to a tool, or an inline script
that reads, greps or prints. The rule is about file *content*.

Two ways it has gone wrong, both quietly enough to cost a debugging session:

- **Backslashes collapse.** `\\` arrives as `\`, so `/[.*+?^${}()|[\]\\]/g` was
  written out as `/[.*+?^${}()|[\]\]/g` — an unterminated character class, and a
  regex literal that no longer parses.
- **A large body can fail to parse at all.** A ~300-line TypeScript file ended
  in `unexpected EOF while looking for matching quote` and wrote nothing.

A heredoc-delivered Python script is the practical way to make the same edit
across many files, and that stays. The collapse above applies to it too, though:
keep backslashes out of the strings such a script matches on or writes, and
anchor on a neighbouring line instead.

Line endings are `.gitattributes`-managed. The CRLF warnings printed on commit
are expected and not something to fix.

## Commits

Subject lines read as a sentence saying what the change does for the user, not
what was touched: *"Explain a missing INCLUDE instead of reporting four
ENOENTs"*, *"Keep the preview's hooks above its early return"*, *"Compile the
whole story, not the file that happens to be open"*. No prefixes, no ticket
numbers, no `feat:`.

The body says why, and names the bug the change came from where there was one.
Commit or push only when asked.
