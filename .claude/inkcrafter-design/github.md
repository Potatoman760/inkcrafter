repo: Potatoman760/inkcrafter
branch: main
path: src/renderer

## Last sync

date: 2026-08-20T02:41:00Z

### Updated in this project

- Read the Electron renderer shell, panel components and `styles.css` class vocabulary as the source of truth.
- Authored a new token layer (dark + light) replacing the ad-hoc `--bg/--accent` set in `src/renderer/src/styles.css`.
- Rebuilt the component inventory implied by the app's own class names.
- Built a UI kit recreating the app's real views.
- Remapped the ink highlighter's lezer tags (`editor/inkLanguage.ts`) onto design tokens.

## Screen map

| Project screen                   | Built from                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ui_kits/app/AppShell.jsx         | src/renderer/src/App.tsx, layout/rightDock.ts, layout/Splitter.tsx                                                             |
| ui_kits/app/SidebarPane.jsx      | src/renderer/src/project/FileTree.tsx, codex/CodexPanel.tsx                                                                    |
| ui_kits/app/EditorView.jsx       | src/renderer/src/editor/InkEditor.tsx, editor/inkLanguage.ts, App.tsx diagnostics footer                                       |
| ui_kits/app/ManuscriptScreen.jsx | src/renderer/src/manuscript/ManuscriptView.tsx, JunctionCard.tsx, ManuscriptOutline.tsx                                        |
| ui_kits/app/PlanScreen.jsx       | src/renderer/src/plan/PlanGrid.tsx, PlanCard.tsx, PlanStructure.tsx, PlanMatrix.tsx                                            |
| ui_kits/app/GameScreen.jsx       | src/renderer/src/manager/GameManagerView.tsx, media/MediaPanel.tsx, stats/StatsPanel.tsx, npcs/CastPanel.tsx, map/MapPanel.tsx |
| ui_kits/app/AssistantDock.jsx    | src/renderer/src/assistant/AssistantPanel.tsx                                                                                  |
| ui_kits/app/Overlays.jsx         | src/renderer/src/settings/SettingsDialog.tsx, project/ProjectDialog.tsx, editor/InkContextMenu.tsx                             |
| ui_kits/app/FirstRun.jsx         | src/renderer/src/project/ProjectPicker.tsx                                                                                     |
