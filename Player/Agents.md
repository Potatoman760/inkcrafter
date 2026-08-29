# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based **visual-novel engine + hybrid game** built on **Phaser 4** and **Ink**
(via `inkjs`). Narrative is authored in `.ink` and compiled in the browser at
startup. Beyond linear dialogue it also has a clickable world map, player stats,
background NPC state, and image/video presentation. See `README.md` for the
player-facing walkthrough and the full authoring reference (tag table, asset
registration, adding stats/NPCs/locations).

## Commands

```bash
npm install
npm run dev        # Vite dev server (plays game/game1/)
npm run typecheck  # tsc --noEmit
npm run build      # spec:check THEN typecheck THEN vite build -> dist/
npm run preview    # serve the production build
npm run games      # list the games in game/
npm run spec:sync  # re-copy the interchange spec from ../InkCrafter
npm run spec:check # fail if the vendored spec has drifted

npm run dev -- --game breedhaven   # or `-- breedhaven`; also on build/preview
```

`dev`, `build` and `preview` go through [scripts/play.mjs](scripts/play.mjs),
which takes `--game <id>` (or a bare id that names a folder in `game/`) and
passes everything else through to vite. It sets `VITE_GAME` for `dev` and
`build`; `preview` serves an already-built player, where that value is baked, so
there it opens the browser on `?game=<id>` instead. `VITE_GAME=x npm run dev` is
a bourne-shell idiom that silently does nothing in PowerShell, which is why the
game is an argument and not an env var.

There is **no test runner and no linter configured** — `tsc --noEmit` (strict, with
`noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`) is the only
automated check. Run it before considering a change done. Requires Node 18+.

Imports use the `@/*` → `src/*` path alias (defined in `tsconfig.json`).

## Critical gotchas

- **This is Phaser 4, not Phaser 3.** Most Phaser docs/training data describe v3
  and some APIs differ. The `phaser` package vends v4 — verify against it, don't
  assume v3.
- **This player never compiles ink.** It imports inkjs's *runtime* build
  (`import { Story } from "inkjs"`), not `inkjs/full`. Stories arrive already
  compiled, in a bundle. Do not reintroduce a compile path: it would double the
  inkjs payload, and it would put a second thing in a position to declare ink
  variables that the editor already declares.
- **`src/bundle/spec/` is vendored, not authored here.** It is a copy of
  InkCrafter's `src/shared`, kept in step by `npm run spec:sync` and guarded by
  `npm run spec:check` in the build. Change it in InkCrafter, then re-sync.
- **Save slots are namespaced per game** — `mc:save:<project id>:<slot>`.
  `main.ts` calls `SaveManager.use(...)` once, before Phaser exists, because
  several games share one origin's `localStorage`. Bump `SAVE.version` in
  `gameConfig.ts` whenever the save format changes
  incompatibly — saves are versioned `localStorage` blobs.
- The story is compiled with `countAllVisits = true` (in `StoryEngine.fromSource`);
  map progression gating relies on `VisitCountAtPathString`. It is a *compile
  time* flag baked into the emitted JSON, so it is InkCrafter's exporter that
  has to keep passing it — nothing here can put it back.

## Architecture (the big picture)

**This is a player, not an authoring tool.** The story it plays comes from
**InkCrafter** (`../InkCrafter`), an Electron editor that compiles the ink and
writes a self-contained *bundle*. This repo reads that bundle at runtime and
knows nothing else about the editor. The two meet at one versioned spec,
authored in InkCrafter's `src/shared` and vendored here as `src/bundle/spec/`.

**Engine outside `game/`, games inside it.** `game/` is Vite's `publicDir`, so
its *contents* are served at the site root — `game/game1/` is `/game1/` in dev
and `dist/game1/` in a build, and a game id is therefore all
[loadBundle.ts](src/bundle/loadBundle.ts) needs to resolve a base URL. One
folder per game, each a complete bundle, which is the whole point: an export has
exactly one directory to land in.

```
game/
  game1/          the default (`GAME.default` in gameConfig.ts); `?game=game2`
    manifest.json read first: format, contentHash, knots, media to preload
    story.json    compiled ink (countAllVisits on)
    catalogue.json  stats and items
    media.json    the media catalogue a `# bg:`/`# show:`/`# anim:` tag names
    npcs.json     the cast
    map.json      places and their gates
    achievements.json  Steam API names and Ink-global unlock conditions
    media/…       the files themselves
  game2/          …another, entirely independent
```

`?bundle=<url>` still overrides with a whole URL, for a bundle served elsewhere.
A build copies every game into `dist/`; `assets` is the one name a game folder
may not take, since Vite writes the engine's JS there.

[loadBundle.ts](src/bundle/loadBundle.ts) fetches the game *before Phaser starts*
(`main.ts`) — `preload` is not async, so `BootScene` has to already hold the
bundle when it starts registering files with the loader. It is handed in through
the registry by `preBoot`; scenes reach it via
[bundle/registry.ts](src/bundle/registry.ts).

**Ink is the single source of truth.** The story drives presentation, stats, and
NPC state through text + `#` hashtag *tags*. Because stats and NPC attributes are
ink variables, serializing ink state (`story.state.ToJson()`) captures story
progress *and* all game state in one blob.

**One shared `GameState`, created once.** `BootScene` registers every file the
manifest lists, builds `GameState` (which loads the *compiled* story), and
stashes it on the Phaser **registry**.
Every other scene retrieves it via `getGameState(scene)` ([registry.ts](src/state/registry.ts)).
`GameState` owns: the `StoryEngine`, `StatsManager` and `NpcManager` (typed facades
over ink variables), and `SceneMeta`.

**Scene flow.** `Boot → MainMenu → VN`. `Settings` is a modal title-screen
overlay; `SaveLoad` and `Map` are launched as
**overlays** over a *paused* `VN` (`scene.launch(...)` + `scene.pause()`), not
swapped scenes — so they resume the same `VNScene` instance.

**The core loop ([VNScene.ts](src/scenes/VNScene.ts)).** `proceed()` is the engine:

1. If `engine.canContinue` → `presentLine()`; else if choices exist →
   `presentChoices()`; else → `endStory()` (dead end stays on screen).
2. `presentLine` walks each tag command twice over: `state.trackTag(cmd)` updates
   `SceneMeta` (the saved frame), then a `switch` applies side effects — `bg`/
   `show`/`anim`/`hide`/`clear` hit the `MediaLayer`, `music` hits the
   `MusicPlayer`, `stat` hits `StatsManager`, `npc` hits `NpcManager`.
3. `# autosave` sets a pending checkpoint. The next complete displayed line or
   choice commits it, so a load never lands halfway through processing a knot.

**Hiding the interface.** Right-click anywhere, or `H`, toggles `uiHidden`, and
`VNScene.applyChrome()` is the one place that decides what is on screen: dialogue,
quick menu, choices, and all toolbar buttons. Every control is *told*
each time rather than toggled, so a button rebuilt while hidden (`refreshMapButton`,
`showChoices`) does not come back on its own, and the two reasons to hide — a clip
playing, and the reader looking at the art — compose instead of fighting. The
listener is on the scene's input rather than the advance zone, since the panel the
reader wants gone is exactly what the pointer is over; the zone itself now only
advances on `leftButtonDown`, and `disableContextMenu()` keeps the browser out of
it. While hidden, an advance instead restores — otherwise a reader admiring the art
would click past a line they never saw — and hiding stops a skip, whose control
would be the first thing to vanish. Hidden choices cannot be misclicked because
Phaser does not hit-test what it would not draw.

**Quick menu.** [QuickMenu.ts](src/ui/QuickMenu.ts) is the row along the bottom
— Back, Skip, Q.Save, Q.Load — the things a reader does *to* the story rather
than *in* it. Each item asks for its own label and enabled state, and the bar is
rebuilt on change like the Map button; `remember()` only redraws it when the
answer has actually moved, since skipping calls it ten times a second.

**Back is a real rollback, and ink has none.** [History.ts](src/state/History.ts)
keeps a bounded stack of `{ inkState, sceneMeta }` — the same serialisation a
save is made of, in memory — pushed at the moments a reader *acts* (advancing,
choosing, one step of a skip) and not on the internal continuation of a tag-only
line. It is *cleared* by a load or a map jump: those frames are real positions,
but stepping back into them would be a jump rather than an undo. Q.Save rotates
through ten Quick slots and Q.Load opens the newest one.

**Skipping.** The ▶▶ Skip control runs `proceed()` on a `SKIP_STEP_MS` timer, revealing each line in
full as it goes. It stops itself at a choice or a dead end, and is cancelled by
any manual advance, by opening an overlay (which pauses the scene, freezing the
timer mid-run), and by a load or a map jump. A `# play:` clip is *cut* rather
than waited out (`MediaLayer.cutVideo`, which calls the held completion callback
by hand since destroying a video emits nothing) — stopping at a cutscene would
halt the skip at the thing it was asked to get past.

**Tag pipeline.** `tags.ts` parses raw ink `currentTags` strings into a typed
`TagCommand` union; `VNScene` and `GameState.trackTag` both `switch` over that
union. Adding a tag = extend the union **in InkCrafter's `tagSpec.ts`**, re-sync,
then handle it in both places. Both switches end in `default: assertNever(cmd)`
([src/util/exhaustive.ts](src/util/exhaustive.ts)) — without it a statement
switch accepts a new union member and silently ignores it, which in a tag
pipeline means a story writes a tag and the game does nothing.

**Music.** `# music:` is a *setting*, not an event: it holds across lines and
knots until `# music: stop`, so it lives in `SceneMeta` beside the background and
is restored by a load. [MusicPlayer.ts](src/audio/MusicPlayer.ts) is separate
from `MediaLayer` because Phaser's sound manager belongs to the *game*, not a
scene — a track keeps playing under the paused `VNScene` while the map or menu is
open, and correspondingly nothing stops it when the scene ends unless `VNScene`'s
`SHUTDOWN` handler does. Re-stating the track already playing is a no-op, for the
same reason re-showing a character does not move them.

`# music: stop 5` fades over five seconds; a bare `stop` (and `stop 0`) cuts, so
the spec leaves `fade` off when it is zero and absent and zero are one case. It
belongs to the *stop*, not to the track — a later tag naming a track carries no
fade — and so it never reaches `SceneMeta`: the fade describes how the music
ended, and a frame is a position rather than a transition, which is why a load
restoring silence cuts to it rather than fading in reverse. The ramp runs on
`Phaser.Core.Events.POST_STEP` — the **game's** step, not `scene.tweens` or
`scene.time`, both of which stop with a paused `VNScene` and would leave a
half-volume drone under an open map. It is the same reason the track itself keeps
playing there. Naming the fading track again *recovers* it where it is instead of
starting it over, which is also what a reader stepping Back over the stop hears;
naming a different one cuts, so the faded level never leaks into it. `fade` is a
new field on an existing command rather than a new `kind`, so `assertNever`
catches nothing here and a typecheck passes whether or not the tag is wired up —
the call sites have to be found by hand.

**Audio settings are player-wide.** [AudioSettings.ts](src/audio/AudioSettings.ts)
persists Master, Music, and SFX independently of any game bundle. Effective
music volume is Master × Music; video audio is Master × SFX, and future sound
effects should use that same SFX value. Both `MusicPlayer` and `MediaLayer`
subscribe so an already-playing sound follows a live settings change.

**A clip is a file, not a kind.** There was a `video` kind played by `# play:`
and it is gone: a clip is either what the scene is set against or something
happening over it, so it is a `background` or an `animation` and `isVideoFile`
answers which sort of file it is. `MediaLayer.setBackground` therefore *replaces*
rather than re-textures — a still and a clip are different Phaser objects and one
cannot become the other — and background clips keep their embedded audio. They
loop by default, since a scene can outlast a few seconds of footage;
`# bg: name once` instead plays one time and holds the final frame. The playback
mode lives in `SceneMeta`, so it is restored by saves and Back. Audible clips may
wait for the browser's media lock to be released by the reader's first interaction.
Nothing suspends the story any more, which is why `VNScene` no longer carries a
`busy` flag.

**Animations are a lightbox, not a fourth character.** `# anim:` lays a pale
white wash over the background and the whole cast (`DEPTH.animCover`, the
`ANIM_COVER` values matching the editor's `.stage-cover`) and runs the effect on
top of it (`DEPTH.anim`), contain-fitted to the canvas by `fitInside` — scaling
*up* as well as down, since an effect drawn small would otherwise sit stranded at
its natural size. Hence no slot: an effect is rarely a person's width and rarely
wants a third of the frame. Several stack in the order the tags came. They live
in `SceneMeta.anims`, a separate namespace from `sprites` — a story may have a
character called `rain` and an effect called `rain` — and nobody speaks, so none
is ever the active one. `# anim: none` takes them all down; `# clear` takes the
cast *and* the effects. The file may be a clip or a still and the catalogue does
not say which (`animation` is what an asset is *for*), so `MediaLayer.showAnim`
and `BootScene` both ask `isVideoFile` about the path — which is also a small lie
in the manifest, since the exporter derives `AssetKind` from the catalogue kind
and labels a `.webm` animation `image`.

**Staging.** Characters are anchored feet-down on the *bottom edge* of the
canvas (`BASELINE_Y = 1`) and drawn at `CHARACTER_HEIGHT` of its height —
nearly all of it. Both numbers matter together: a backdrop is cover-fitted, so a
baseline short of the bottom stands somebody on a line that is not in the
picture, and a short character beside it reads as a doll placed in the scene
rather than a person in it. Cutout art is a figure head to foot (the bundles
here carry 1080×1920 portraits), so full height with the dialogue panel over the
knees is the shape to aim at. They stand in one of three named slots
(`# char: kael at left`) and may be drawn mirrored (`… at left flipped`) — as may a
background (`# bg: hall flipped`) and an animation, one word meaning one thing
everywhere it appears. On a background it is applied *after* `fitToScreen`, since
that sets the scale the mirror sits on top of. The two look alike and
behave oppositely on purpose: a slot is *inherited* (`slotFor`) so a change of
expression does not walk somebody across the stage, while a flip is *restated*
by every show tag, so a tag that stays quiet means "as drawn" and there is no
word for turning it off. Sprites are anchored feet-down on a common baseline and scaled so everyone is the
same fraction of stage height — bundle art arrives at wildly different sizes
(420×620 in `game1`, 90×120 in `breedhaven`), and matching heights is what makes
two pictures look like two people in one room. All of that lives in
[stageLayout.ts](src/media/stageLayout.ts), which is pure and takes the stage as
an argument; `MediaLayer` decides *who* is on screen, not where or how big.
Whoever is speaking is drawn at full strength and the rest are played down.
`GameState.emphasis(text)` decides, from the finished frame (tag order within a
line is not guaranteed), returning one of three answers rather than a
name-or-nothing: `on` a character, `everyone`, or `nobody`. The third exists only
for `# active: none`; the second is the *default*, because being played down is
something another character's line does to you and there is nothing to be played
down against when nobody has the line. So an explicit `# active:` wins, then the
name the prose opens with (`Kael: …`, via `nameBefore`), then `# speaker:` — and
any inferred name must belong to somebody *on stage*, which is what keeps a
narrator, a mentioned-but-absent character and a stray colon harmless, and what
makes a lone character lit without a rule of its own. The look is
`MediaLayer.dress`, which is only ever an *effect* — the tint, alpha and scale in
`EMPHASIS`, never a change of texture. Which picture a character wears belongs to
the story (`# char: kael/wary`); if emphasis could swap it, an authored
expression would be lost the moment somebody else spoke.

**Saves know which story they are of.** `SaveData` carries the bundle's
`project.id` and `contentHash` alongside ink state. A different story is refused
(localStorage is keyed by origin, so two games on one dev server share slots); a
*rewritten* story is offered anyway and marked "older draft", because most edits
leave a save perfectly loadable and content changes constantly while writing.

**Save/restore = ink state + `SceneMeta`.** Ink's serialized state restores story
position, stats, and NPC vars for free. `SceneMeta` (background, sprites, speaker,
`lastText`, `mapEnabled`) is saved alongside so a load can *rebuild the exact
on-screen frame* (`media.rebuildFrom` + `dialogue.setLine`) without re-running the
story. Choices are the exception: they are not part of the frame but what the
story offers *next*, so `rebuildAndShow` re-offers them when ink has some
pending — without that, a load or a step Back onto a decision shows the line and
no way to answer it. `SaveManager` handles four pages of ten manual slots plus
separate rotating pages of ten Quick and ten authored Auto saves. Legacy
`quick`, `auto`, and numbered keys are read through aliases into the new pages.

**Nothing here generates ink.** NPC variables (`<inkId>_<key>`) and player stats
are declared in InkCrafter's generated `ink/state.ink`, from `npcs.json` and
`stats.json`. This player used to prepend its own `VAR` block before compiling;
two things declaring one name is a compile error, so exactly one may, and it has
to be the side that compiles. They are ordinary ink globals, so they serialize
into a save for free.

**World maps, plural.** `map.json` holds several maps; a hotspot's
`destination` either travels into the story (`to: 'knot'`) or opens another map
(`to: 'map'`), so an overworld's city gate opens the city and the city's road out
opens the overworld again. A link between maps is not travel — the story has not
moved — so `MapScene.follow` sets `sceneMeta.mapArea` and restarts the scene,
staying in the overlay.

Which map is showing is a fact about *where the reader is in the story*: each map
claims the knots it belongs to (a knot claims its stitches), and `mapForKnot`
returning null leaves the showing map alone. That makes it sticky, so it lives in
`SceneMeta` rather than being recomputed on load, and only the knots where the
map *changes* need listing. `GameState.followMap()` is called from `advance()`
**after** `engine.continue()` and never before: ink moves its pointer past a line
as it hands it over, so reading afterwards reports the knot just entered, while
reading beforehand sits at the end of the previous knot with its divert not yet
followed — a story walking from one knot to another would never report arriving.
`showingMap()` falls back to the first map, so a one-map game needs no `knots`
list at all. The picture and the hotspot coordinates are still one space, fitted
together, contained rather than covered.

## Where to make common changes

- **Write/edit story content** → in **InkCrafter**, then `Export for Player…`
  (`Ctrl+E`) into a folder under this repo's `game/` and reload. From a
  terminal, in the InkCrafter checkout:
  `npm run export -- --project <dir> --out ../InkCrafterPlayer/game/game1`.
- **Add a second game** → export it to `game/<name>/` and play it with
  `npm run dev -- --game <name>` (or `?game=<name>` in the URL); nothing in the
  engine has to change.
- **Add a tag** → in **InkCrafter**'s `src/shared/bundle/tagSpec.ts` (the union,
  `parseTag`, `formatTag`, `TAG_KEYS`) plus its vitest cases and `preflight.ts`,
  then `npm run spec:sync` here and handle it in
  [VNScene.ts](src/scenes/VNScene.ts) and [GameState.ts](src/state/GameState.ts).
  [src/narrative/tags.ts](src/narrative/tags.ts) is only a re-export.
- **Add an asset** → in **InkCrafter**: drop the file in the project's `media/`
  and catalogue it. There is no asset registry in this repo any more; a tag is
  resolved against the bundle's `media.json` at runtime by
  [AssetIndex.ts](src/bundle/AssetIndex.ts).
- **Add a player stat** → in **InkCrafter**'s Story Stats. It declares the `VAR`
  and carries the label and clamps; the player reads them from
  `catalogue.json` ([StatsManager.ts](src/state/StatsManager.ts)).
- **Add an NPC** → in **InkCrafter**'s Cast. One ink `VAR` per attribute is
  generated into `ink/state.ink`; the player reads the shape from `npcs.json`
  ([npcs.ts](src/state/npcs.ts) is now only a re-export of the spec).
- **Add a map location** →
  in **InkCrafter**'s World Map: drag the hotspot onto the picture, pick a knot
  to travel to, and build the gate from the stats and cast that exist.
  [world/locations.ts](src/world/locations.ts) is now just the evaluator's
  adapter over `GameState`.
