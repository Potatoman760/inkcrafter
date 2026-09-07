# Minigame modules

Each minigame has its own folder in three layers:

```
Editor/src/shared/bundle/minigame/<kind>/
  data.ts          definition, defaults, parser; default export { kind, create, parse }
  check.editor.ts  optional authoring checks and named stat tunings
Editor/src/renderer/src/minigame/<kind>/
  editor.tsx       label, factory, fields, optional media lifecycle hooks
Player/src/minigame/<kind>/
  player.ts        default export { kind, sceneKey, scene }
```

Keep supporting components, game logic, and scene helpers inside the matching
folder. Shared tunable numbers and parsing helpers live in `minigame/common.ts`.
The old `minigameDoc.ts` and `estate.ts` entry points remain compatible imports.

The editor and player discover `*/editor.tsx` and `*/player.ts` with Vite's file
glob imports. They validate duplicate kinds and missing counterparts at startup.
The player registers the discovered scenes and uses the same registry for story
tags and the editor's **Test in player** action. Missing encounters open a shared
error screen with a return action.

Data modules use generated ordinary imports so they also run in the standalone
Node exporter. `Editor/scripts/sync-minigames.mjs` discovers `*/data.ts` and
`*/check.editor.ts`, generates their registries, and derives the definition union
from the factories. It runs before the editor's dev, build, typecheck, test, and
export commands. Do not hand-edit the generated registries.

To add a kind:

1. Add the three entry points in matching `<kind>` folders. Use an existing
   module as a reference and the `MinigameEditor`/`MinigamePlayer` contracts.
2. Run `npm run minigames:sync --workspace inkcrafter` and
   `npm run spec:sync --workspace inkcrafter-player`. Spec sync discovers all data
   helpers recursively; tests and `*.editor.ts` files stay editor-only.
3. Run the root typecheck, tests, and build commands. Restart a running dev server
   after adding or removing a data module.

These are trusted source modules discovered at build time and shipped with the
apps. Adding executable modules requires rebuilding. Project `minigames.json`
and exported bundles retain their existing data format, stable ids, and media
references; existing projects need no migration. Project data does not execute
JavaScript or receive filesystem access in the renderer.
