# Assets

**There is no logo.** `Potatoman760/inkcrafter` ships no mark, wordmark file, icon set,
illustration or photograph — the renderer draws everything from CSS. Nothing was
invented to fill the gap: wherever a mark would go, set the name in type
(see `guidelines/brand-wordmark.html`).

## Icons

Lucide, loaded from CDN by `components/core/Icon.jsx`
(`https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons/<name>.svg`).
This is a **substitution, flagged**: the app currently uses no icons at all —
only unicode characters (`⤢` to expand a plan node, `×` to detach a file). Lucide
was chosen for the new system per the brief.

For the packaged Electron build, vendor the glyphs instead of fetching them:

```
npm i lucide-static
# copy node_modules/lucide-static/icons/*.svg into resources/icons/
```

then point `BASE` in `Icon.jsx` at that folder.

## Imagery

The design system uses no photography or illustration. Where a screen needs art
that does not exist yet — a sprite, a background, a map — use the `Placeholder`
component (striped box, monospace label saying what belongs there), never a
drawn stand-in.
