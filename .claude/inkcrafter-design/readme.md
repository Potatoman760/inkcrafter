# InkCrafter Design System

A design language for **InkCrafter** — a desktop workshop for branching visual
novels. It is not only an ink editor: the same window plans the story, reads it
back as a manuscript, and manages the game's media, stats, items, cast and map,
with an AI assistant docked beside all of it.

This system exists so the app can be built quickly and still look deliberate:
one token layer, one CSS component layer, one set of rules about where commands
live.

## Sources

Everything here was derived from the product's own code, not from screenshots
alone.

| Source                                                             | What was taken from it                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `github.com/Potatoman760/inkcrafter` @ `main`, `src/renderer/**`   | Layout, component inventory, class-name vocabulary, ink token names, copy voice |
| `src/renderer/src/styles.css` (62 KB, ad-hoc)                      | The full class vocabulary the new CSS layer replaces one-for-one                |
| `src/renderer/src/App.tsx`                                         | The five-column workspace grid, view switch, dock, diagnostics footer           |
| The user's screenshot of the running build (Windows, Game ▸ Media) | Density check, real project content, assistant panel state                      |

Electron + React + TypeScript, Vite (`electron.vite.config.ts`), targeting
Windows, macOS and Linux.

The previous look was a dark grey shell with an amber accent
(`--bg: #16161a`, `--accent: #f0b26b`) and roughly 300 hand-written class rules
with no shared scale. The brief was to rethink it: same dark-tool DNA, a real
system underneath, plus a light theme.

---

## Content fundamentals

The app's existing copy is unusually good, and the system keeps it. Study
`AGENTS.md` and the panel source if you want more of it.

**Voice — a knowledgeable colleague explaining a decision, not a product.**
Sentences state what a thing does and why it is where it is:
"Images live in `media/` inside the project. Add them there and press rescan."
"It can read and write files in your workspace. It cannot reach anything
outside it."

**Rules**

- **Sentence case everywhere.** Buttons: "Add chapter", "Open folder", "Paste an
  outline…". Never Title Case, never ALL CAPS in prose. Uppercase is a _label_
  treatment (tracked, 11px), never a word choice.
- **Second person for the author, "it" for the assistant.** "Ask it to build
  something…" — never "I", never a persona name.
- **Numbers, not adjectives.** "Compiled in 32ms", "2 in the folder that no
  character or background claims", "42 mentions in this file". Never "All good!",
  never "Great job".
- **Name the file.** Anything that writes to disk says the path:
  "Saving rewrites `ink/state.ink` and adds an INCLUDE to `main.ink`."
- **Empty states name the next action** and give a real control next to it:
  "No entries yet. Add characters, locations and lore here and they will be
  underlined wherever they appear in your story."
- **Ellipses mean a further step.** "Paste an outline…", "Add a choice…" open
  something; "Save", "Rescan" act immediately.
- **Lowercase link-buttons** for small reversible actions inside headers and
  cards: `settings`, `folder`, `libraries`, `edit`, `delete`, `detach`.
- **Identifiers are monospace, always.** File paths, knot names, ink variables,
  tags (`# bg:cove/dawn`), model ids. If the author could type it into ink, it is
  `var(--font-mono)`.
- **No emoji. No exclamation marks.** The repo contains neither.
- **Errors quote the compiler, then help.** "Expected a knot name after '->'.
  'the_singal' is not defined." — and the row is clickable, jumping to the line.

---

## Visual foundations

### Colour

A cool neutral ramp (`--ink-1000` … `--ink-0`) plus **five accents that share
one lightness and one chroma in oklch and differ only in hue** —
`oklch(0.74 0.12 H)`. That is the whole palette. Because nothing is more
saturated than anything else, an error pill and an active tab can sit in the
same toolbar without a fight.

| Accent             | Hue | Means                                     |
| ------------------ | --- | ----------------------------------------- |
| `--accent-signal`  | 252 | selection, focus, active tab, links       |
| `--accent-branch`  | 168 | choices, diverts, structure — _branching_ |
| `--accent-good`    | 150 | compiled, saved, reachable                |
| `--accent-caution` | 78  | warnings, todo, unsaved, gated            |
| `--accent-alert`   | 25  | errors, destructive                       |

Semantic aliases (`--surface-*`, `--text-*`, `--border-*`, `--state-*`,
`--syntax-*`) are what components use; raw ramp values are never referenced
directly. Backgrounds are **flat** — no gradients anywhere, no coloured glows,
no tinted panels. Five surfaces carry the whole hierarchy: canvas, pane, raised,
overlay, inset.

Dark is the default. `data-theme="light"` on `<html>` (or any container) flips
every token; accents drop to lightness 0.52 to hold contrast on paper-white.

### Type

**IBM Plex, all three cuts** — one family, three jobs:

- `--font-ui` Plex Sans — the interface. 13px default, 12px in controls.
- `--font-mono` Plex Mono — anything the author could type into ink: paths, knots,
  variables, tags, model ids, counts inside badges.
- `--font-read` Plex Serif — the manuscript view only, 16px/1.65 at a 62ch
  measure. The reading column never widens; the pane grows around it.

Section labels are 11px uppercase at `--tracking-label` (0.09em), weight 500–600,
`--text-tertiary`. They are labels, not headings — never bold, never larger.

### Spacing and density

2px base scale; four control heights (20 / 24 / 28 / 32) that **everything**
clickable lands on. That single rule is most of what makes a five-pane window
look composed instead of assembled. Compact by intent: an author has files,
source, dock and diagnostics on screen at once.

### Shape, elevation, borders

Radii are small: 2 / 3 / 5 / 8 and pill. Panes and toolbars are square where they
meet the window frame; things that float are rounded 5–8px. Panels are separated
by **1px hairlines only** — a second border on the same edge is a bug. Three
shadows exist (`raised`, `pop`, `dialog`), all neutral black; none are coloured,
and nothing has both a shadow and a heavy border.

Cards: 1px `--border-default`, radius 8, `--shadow-raised`, and a 2px **status
stripe on the top edge** (planned / drafting / done) so a plan board reads at a
glance. No coloured left-border accents.

### Motion

Everything is `--ease-out` (`cubic-bezier(.2,.7,.3,1)`) and under 150ms: 90ms for
hover and colour, 140ms for menus and popovers, 220ms for toasts and dialog
entry. **Nothing bounces. Nothing scales on press** — press is a background
change, because a 1px nudge in a dense toolbar reads as a layout bug. One
animation exists: the busy status dot pulses. `prefers-reduced-motion` zeroes
all durations.

### States

- **Hover** — surface goes one step lighter (`--surface-hover`), text one step
  brighter. Never a colour change on its own.
- **Press** — `--surface-active`. No transform.
- **Focus** — 2px `--focus-ring` outline, 1px offset, on everything focusable.
- **Selected** — surface change **plus a 2px accent marker on the left edge**, so
  selection survives a light theme and colour-blindness, and so a row can be
  selected and focused at the same time visibly.
- **Disabled** — 45% opacity, cursor default. Never hidden: a control the author
  cannot use yet still teaches that it exists.
- **Dirty / unsaved** — a 5px `--accent-caution` dot after the name.

### Transparency and blur

Almost none. Scrims are `--surface-scrim` with a 2px backdrop blur, and the
accent washes are 16% alpha of their own hue. No frosted panels, no translucent
sidebars — an editor's background is text, and blur makes text soup.

### Imagery

The system ships no illustration or photography, and the app's imagery is the
author's own (sprites, backgrounds, maps in `media/`). Missing assets draw as a
dashed red `Thumb`; art that does not exist yet draws as a striped `Placeholder`
with a monospace label saying what belongs there. Never draw a stand-in.

---

## The three command surfaces

The brief named the real problem: _buttons are scattered, features are hard to
reach._ The system's answer is a rule, not a component.

1. **Window toolbar** — global only: project identity, the four-view switch, the
   open document, status. At most two quiet icon buttons.
2. **Pane header / tab strip** — actions that affect _that pane only_ (rescan,
   reveal folder, filter, expand). Quiet or icon-only, three at most.
3. **Command palette (Ctrl/Cmd+K)** — every command in the app, sectioned to
   match the application menus verbatim.

The invariant: **anything in a menu or a toolbar must also be in the palette.**
That is what earns the right to keep panes clean. Content areas hold no loose
command buttons; a card's actions live in its head, a dialog's in its footer
(destructive far left, primary far right).

---

## Iconography

Lucide, at 13–14px in controls and 16px in toolbars, tinted with `currentColor`
via `components/core/Icon.jsx`. **Flagged substitution:** the app currently has
no icons at all — it uses unicode (`⤢`, `×`) — so this set is new, not recovered.
See `assets/README.md` for vendoring it into the packaged build.

House set: `file-text folder folder-open book-open map map-pin users package
image sparkles wand-sparkles play git-branch panel-right search settings plus x
check circle-alert triangle-alert rotate-ccw maximize-2 trash-2 lock
corner-down-right sliders-horizontal send save`.

Rules: one icon vocabulary per list — either every row has one or none does. An
icon never appears without a label unless it is unambiguous (close, expand,
reveal, toggle). No emoji, and no second icon family.

---

## Index

| Path                       | What it is                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles.css`               | The entry point. Link this one file; it imports everything else.                                                                            |
| `tokens/`                  | `fonts` · `colors` · `typography` · `spacing` · `shape` · `motion` · `semantic` (dark + light aliases) · `base` (resets, scrollbars, links) |
| `components/<group>/*.css` | The real styling layer — `ic-*` classes usable with or without React                                                                        |
| `components/core/`         | `Icon`                                                                                                                                      |
| `components/controls/`     | `Button` `IconButton` `Input` `Textarea` `Select` `Checkbox` `Field` `Segmented`                                                            |
| `components/data/`         | `ListRow` `Badge` `Chip`/`ChipRow` `Card` (+`CardHead/Title/Summary/Foot`) `Thumb`/`Placeholder`                                            |
| `components/navigation/`   | `Toolbar` (+parts) `Tabs` `PaneHeader`/`GroupLabel` `Splitter` `CommandPalette`/`Kbd`                                                       |
| `components/feedback/`     | `StatusPill` `Diagnostics` `EmptyState`/`Hint` `Toast`/`ToastStack` `Meter`                                                                 |
| `components/overlays/`     | `Dialog`/`DialogSpacer` `Menu`/`MenuItem`/`MenuSeparator`/`Popover` `MasterDetail`/`MasterList`                                             |
| `guidelines/*.html`        | 19 foundation specimen cards (colour, type, space, shape, motion, brand)                                                                    |
| `ui_kits/app/`             | Interactive recreation of the window: editor, manuscript, plan, game, first run                                                             |
| `assets/README.md`         | Why there is no logo, and how icons are sourced                                                                                             |
| `github.md`                | Repo association, last sync, screen map                                                                                                     |
| `SKILL.md`                 | Agent-skill wrapper for use in Claude Code                                                                                                  |

Each component directory has `<Name>.jsx`, `<Name>.d.ts` (props contract) and
`<Name>.prompt.md` (when to use it), plus one demo card.

## Component inventory: how it was chosen

The families come from the app's own class vocabulary in `styles.css` — every
`ic-*` component replaces a real cluster of existing rules (`.codex-item` →
`ListRow`, `.plan-card` → `Card`, `.pane-tabs`/`.view-tabs`/`.manager-tabs` →
`Tabs`, `.settings-overlay`/`.entry-dialog` → `Dialog`, `.ink-menu` → `Menu`,
`.stats-layout`/`.media-layout` → `MasterDetail`, and so on).

### Intentional additions

- **`CommandPalette`** — does not exist in the app. Added because the brief's
  main complaint was reachability, and because it is what lets toolbars shrink.
- **`Icon`** — no icon layer exists to recover; one is needed for the new set.
- **`Toast`** — the app writes files from the assistant and the catalogues with no
  visible confirmation. Toasts make those writes accountable.
- **`Segmented`** — the app builds this shape twice by hand (plan Grid/Matrix,
  word-limit presets); it is one control.

## Caveats

- **Fonts** come from Google Fonts by `@import`. Vendor IBM Plex woff2 files into
  the Electron build before shipping (see `tokens/fonts.css`).
- **Panels read in full and matched field-for-field:** `App.tsx`,
  `layout/Splitter.tsx`, `layout/rightDock.ts`, `project/FileTree.tsx`,
  `project/ProjectPicker.tsx`, `codex/CodexPanel.tsx`, `plan/PlanGrid.tsx`,
  `plan/PlanCard.tsx`, `plan/PlanStructure.tsx`, `manuscript/ManuscriptView.tsx`,
  `manuscript/JunctionCard.tsx`, `manuscript/ManuscriptOutline.tsx`,
  `assistant/AssistantPanel.tsx`, `manager/GameManagerView.tsx`,
  `settings/SettingsDialog.tsx`, `editor/inkLanguage.ts` (the editor's token
  colours are a one-to-one remap of its `HighlightStyle`).
- **Panels NOT read — their kit screens are inferred** from the class structure in
  `styles.css` plus the screenshot, so their section names, field sets, labels and
  ordering are approximations, not the product:
  `media/MediaPanel.tsx`, `stats/StatsPanel.tsx`, `npcs/CastPanel.tsx`,
  `map/MapPanel.tsx`, `map/ConditionEditor.tsx`, `player/StoryPlayer.tsx`
  (dock ▸ Preview), `editor/InkWritePanel.tsx` and `manuscript/WritePanel.tsx`
  (dock ▸ Write), `editor/InkEditor.tsx` and `editor/InkContextMenu.tsx`
  (the editor chrome and right-click menu items). **Verify these before using them
  as reference.**
- `CodexEntryEditor`, `LibraryDialog`, `ExportDialog` and `PlanNodeDialog` are not
  recreated at all — use the `Dialog` + `MasterDetail` + `Field` patterns for them.
