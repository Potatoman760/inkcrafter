# InkCrafter app UI kit

A recreation of the Electron renderer's four views in the new design language,
composed from the design-system components. Interactive: switch views, resize the
panes, right-click the editor, press <kbd>Ctrl</kbd>+<kbd>K</kbd>, toggle the theme
with the button bottom-right.

## Files

| File | Recreates |
| --- | --- |
| `AppShell.jsx` | `src/renderer/src/App.tsx` — toolbar, five-column workspace grid, dock, diagnostics footer |
| `SidebarPane.jsx` | `project/FileTree.tsx` + `codex/CodexPanel.tsx` |
| `EditorScreen.jsx` | `editor/InkEditor.tsx` + `editor/inkLanguage.ts` token colours |
| `ManuscriptScreen.jsx` | `manuscript/ManuscriptView.tsx`, `JunctionCard.tsx` |
| `PlanScreen.jsx` | `plan/PlanGrid.tsx`, `PlanCard.tsx`, `PlanMatrix.tsx` |
| `GameScreen.jsx` | `manager/GameManagerView.tsx` and its four panels (media, stats & items, cast, map) |
| `DockPanel.jsx` | `assistant/AssistantPanel.tsx`, `player/StoryPlayer.tsx`, `editor/InkWritePanel.tsx`, `manuscript/ManuscriptOutline.tsx`, `plan/PlanStructure.tsx` |
| `Overlays.jsx` | `settings/SettingsDialog.tsx`, `project/ProjectDialog.tsx`, `editor/InkContextMenu.tsx` |
| `FirstRun.jsx` | `project/ProjectPicker.tsx` |
| `data.js` | Fixtures shaped like `@shared/*` types, using the repo's example project |

## Deliberate departures from the current build

These are the design decisions, not accidents:

1. **A command palette (Ctrl+K)** that indexes every menu command. It is what
   allows toolbars and pane headers to stay short.
2. **Commands live in exactly three places** — window toolbar (global), pane
   header (that pane only), palette (everything). No loose buttons in content.
3. **The Game view's two tab rows** keep the app's own structure, restyled: row
   one is which catalogue, row two is that catalogue's own sections.
4. **Master–detail is a component**, so media, stats, items, cast and providers
   are the same shape rather than five near-misses.
5. **The editor's token colours** are a direct remap of the `HighlightStyle` in
   `editor/inkLanguage.ts` — one token per lezer tag (heading, keyword, link,
   operator, meta, labelName, string, number, comment), with prose left unstyled
   exactly as the real highlighter leaves it.

## Not grounded in source — verify before reusing

These screens were inferred from `styles.css` class names and the app screenshot,
because their components were not read: **Media**, **Stats & items**, **Cast** and
**Map** sections in `GameScreen.jsx`, and the **Preview** and **Write** tabs in
`DockPanel.jsx` (`MediaPanel.tsx`, `StatsPanel.tsx`, `CastPanel.tsx`,
`MapPanel.tsx`, `ConditionEditor.tsx`, `StoryPlayer.tsx`, `InkWritePanel.tsx`,
`WritePanel.tsx`). Their field sets, labels and ordering are plausible, not
authoritative. The editor's chrome and right-click menu items likewise stand in
for `InkEditor.tsx` / `InkContextMenu.tsx`.

Everything else — shell, sidebar, codex, plan grid and matrix, plan structure,
manuscript, reading outline, assistant, settings, project dialog, first run — was
built from a full read of its component.
