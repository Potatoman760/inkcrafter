# InkCrafter Player

A visual-novel player for the web and the desktop, built with
[Phaser 4](https://phaser.io/) and [Ink](https://www.inkle.com/ink/).

It is an engine with no story in it. Everything a particular game is — its
script, its art, its cast, its music — arrives as a _bundle_, a single folder
written by the **[InkCrafter](https://github.com/Potatoman760/inkcrafter)** editor.
Drop a bundle in and the same build plays it. Drop in two and you can switch
between them with a command-line flag.

## You need the editor too

This half of the pair only reads bundles. The other half is where they are made:

> **[github.com/Potatoman760/inkcrafter](https://github.com/Potatoman760/inkcrafter)**

Writing, drawing, casting, gating and packaging all happen there, because it is
the side that can check what it writes — that a sprite exists before a line asks
for it, that a place on the map leads somewhere real. Nothing in this repository
authors anything, and there is no story file here to edit.

**The reference documentation lives in that repository**, not this one. The tag
vocabulary a script uses to move the story — which background is up, who is on
screen, what the music is doing — belongs to the editor that writes those tags
and the spec both applications share. Look there for it, and for anything about
how a project is structured, exported or protected.

Clone them side by side. Several commands here assume the editor is a sibling
folder: the shared spec is copied across from it, and an export writes straight
into this player's `game/` directory.

## What a reader gets

**Reading.** Dialogue reveals with a typewriter effect and a speaker label;
clicking mid-reveal finishes the line rather than skipping it. Choices appear as
a stack of buttons and branch the story.

**Getting out of the way.** Right-click, or press `H`, and the dialogue,
controls and choices all step aside so the art can be looked at. Anything that
would normally advance the story instead brings them back, so a line is never
read past unseen.

**The quick menu** along the bottom holds the four things a visual-novel reader
reaches for constantly:

- **Back** — a real rollback. It steps back a line at a time, and back onto a
  choice so a decision can be taken again. Stats and character state rewind with
  it, not just the words.
- **Skip** — runs forward at about ten lines a second and stops itself at the
  next choice. Any click or keypress takes control back.
- **Q.Save / Q.Load** — ten rotating bookmarks, dropped and picked up without
  opening a menu.

**Saving.** Forty numbered slots, plus separate rotating pages of quick saves
and of automatic checkpoints the story asks for at its own safe moments.
**Continue** takes the newest valid save of any kind. A save knows which story it
belongs to and says so when that story has moved on. In a browser they live in
`localStorage`; on the desktop they are one file written atomically with a
backup, and synchronised through Steam Cloud when Steam is running.

**Presentation.** Characters stand in named positions and can be mirrored;
whoever is speaking is drawn at full strength while the rest are played down.
Backgrounds and effects may be stills or looping clips, and full-screen effects
run over a pale wash for a spell or a flashback. Music holds under a scene across
the whole story until something changes it, and survives a save.

**A world map**, when a story has one: clickable places that travel elsewhere in
the script, each gated on progress, a variable or a character's state, with art
of its own or invisible over the picture.

`# map: on` and `# map: off` enable or disable travel. `# map: open` enables
travel and opens the current map once, after presenting its tagged line. The
map's knot assignments select the area. Closing or restoring that frame does
not reopen the overlay; the toolbar remains available.

**Accessibility and comfort.** Master, music and effect volumes; fullscreen;
dialogue size and reveal speed; reduced motion; a high-contrast interface. All of
it persists.

## Controls

|                       | Keyboard       | Controller / Steam Deck |
| --------------------- | -------------- | ----------------------- |
| Advance               | Space or Enter | A                       |
| Back                  | —              | B                       |
| Hide the interface    | H              | Y                       |
| Quick save            | —              | X                       |
| Open the menu         | —              | Start                   |
| Close an overlay      | Escape         | B                       |
| Fullscreen            | Alt+Enter      | —                       |
| Move between controls | —              | Left stick or D-pad     |

The mouse does the obvious things: left click advances, right click hides the
interface. With a controller, whatever has focus is visibly outlined — including
map hotspots that are invisible to a mouse.

## Running it

```bash
npm install
npm run dev        # serve it in a browser
npm run build      # production build into dist/
npm run preview    # serve that build
npm run games      # list the bundles in game/
```

Node 18 or newer (developed on Node 24).

**Nothing plays until a bundle is in `game/`.** Each subfolder there is one whole
game, self-contained, and it is the single directory an export lands in. From the
InkCrafter side that is **File ▸ Export for Player…**, or on the command line:

```bash
npm run export -- --project data/projects/<slug> --out ../InkCrafterPlayer/game/<name>
```

Add `--watch` and it re-exports as you write: change the story, reload the page.

`dev`, `build` and `preview` each take a bundle by name, so trying another one
does not mean editing anything:

```bash
npm run dev -- breedhaven      # or --game breedhaven
npm run build -- breedhaven    # bake it in as the built player's default
```

(The bare name is a shorthand these three accept; the desktop commands below
want `--game`.)

Anything else is handed to Vite, so `npm run dev -- breedhaven --port 5000 --host`
does what it looks like. A name that is not a bundle fails before the browser
opens, and tells you which ones are.

## Desktop and Steam

The same player runs as a sandboxed Electron game, and the editor can export a
game as one: **File ▸ Export… ▸ Desktop game** writes one folder per platform —
Windows, Linux, macOS on Apple silicon and Intel — each holding Electron, this
player's build, the Electron main in `desktop/`, and exactly one bundle. The
folder runs with nothing installed and is what a Steam depot is made of. It is
assembled from Electron's own prebuilt zips, so every platform can be built from
any machine; the one thing that cannot be done away from a Mac is signing the
Mac build, and the export's README says how. Building a Mac folder on Windows
needs Developer Mode on, because the app inside is full of symbolic links.

The shell reads `player.json` beside its `package.json` — the game's id and the
Steam App ID — which is how one engine build serves whichever game it ships with.
The same thing from a terminal, in the editor's folder:

```bash
npm run export -- --project data/projects/<slug> --out <folder> --desktop
npm run export -- --project data/projects/<slug> --out <folder> --desktop --platforms win32-x64 --steam-app-id 480
```

For working on the shell itself, without an export:

```bash
npm run desktop:dev -- --game breedhaven   # run it as a desktop app
npm run desktop:pack -- --game breedhaven  # unpacked build for local testing
npm run desktop:dist -- --game breedhaven  # installer or disk image
```

Steam is optional and off unless configured. With an App ID in place — from the
export, from `steam_appid.txt` beside the executable, or from the environment
Steam itself launches a game in — the native API, overlay, Deck detection and
Cloud saves initialise before the window opens. A shipped build carries no
`steam_appid.txt`, so one started outside Steam restarts itself through it.
Achievements are set up in Steamworks, matched in InkCrafter to a story condition,
and unlocked by the player the moment that condition becomes true — remembered
offline and sent on when Steam is next available. Editor previews never earn
release achievements.

A release bundle can also be **content-protected**, so the story and media are
not shipped as ordinary readable files. It is protection rather than DRM: it
raises the effort, and a determined person can still recover anything the running
player can decrypt.

## Working on the player

`Agents.md` is the guide for anyone changing this code: the architecture, the
rules that are easy to break by accident, and how the interchange spec is kept in
step with the editor. Read that before the source.

Two things worth knowing before you start:

- **`src/bundle/spec/` is not written here.** It is a copy of InkCrafter's shared
  spec — the contract the two applications meet at — kept in step by
  `npm run spec:sync`. The build refuses to run if the copy has drifted.
- **The player never compiles Ink.** A story arrives already compiled, and only
  the editor may declare a variable. Two things declaring one name is a compile
  error, so exactly one is allowed to, and it has to be the side holding the
  compiler.
