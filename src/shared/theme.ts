/**
 * The one colour the main process needs to know.
 *
 * A BrowserWindow's backgroundColor is fixed at construction, before any
 * renderer exists to read a CSS custom property from, so this value cannot come
 * from the token layer at runtime. It is a hand-kept copy of `--ink-1000` in
 * `src/renderer/src/design/tokens/colors.css`, which `--surface-canvas` aliases
 * — the colour the window paints during the ~200ms before `ready-to-show`.
 *
 * `src/renderer/src/design/tokens.test.ts` fails if the two drift apart.
 */
export const WINDOW_BACKGROUND = '#07080a'
