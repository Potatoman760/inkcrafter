/**
 * The workspace's column geometry, in one place.
 *
 * These used to be three constants in App.tsx and three literals in styles.css,
 * and they had already drifted: the stylesheet's fallback grid said 380px where
 * the TypeScript said 420. The defaults now live here and are pushed onto the
 * document element at mount, so the stylesheet reads them rather than repeating
 * them — the same direction the live pane widths already travel.
 *
 * The design system declares the same three values in
 * `design/tokens/spacing.css`, because the `ic-*` layer has to stand on its own
 * outside this app. `design/tokens.test.ts` fails if the two copies disagree.
 */
export const SIDEBAR_DEFAULT = 232
export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 480

export const SIDE_DEFAULT = 420
export const SIDE_MIN = 260
export const SIDE_MAX = 720

/** Matches `.splitter` in the stylesheet, so the tab strip lines up with the
 *  column it belongs to rather than approximately. */
export const SPLITTER_WIDTH = 5
