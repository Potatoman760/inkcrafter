# design/

The InkCrafter design system's token layer, vendored into the app.

`tokens/*.css` is copied **verbatim** from `.claude/inkcrafter-design/tokens/`.
Do not edit those files here. Edit them upstream, re-copy, and read the diff —
that way a regenerated design system shows up as a reviewable change instead of
silently diverging from what the app ships.

It is vendored rather than imported across the `.claude/` boundary because that
directory is untracked: a clean clone has none of it, and the build would fail
on any machine but this one.

One file is ours, not the design system's:

- `fonts.css` — the upstream `tokens/fonts.css` pulls IBM Plex from Google
  Fonts. The packaged renderer's CSP is `style-src 'self'` / `font-src 'self'
  data:` / `connect-src 'none'`, so a remote stylesheet cannot load. This
  declares the same faces against the woff2 files in `fonts/`. Note the CSP is
  build-only, so a broken font URL still passes `npm run dev` and only fails —
  silently, falling back to Segoe UI — in the packaged app.

There was briefly a `bridge.css` here too, aliasing the ten colour variables
the old `styles.css` was written against (`--bg`, `--accent`, `--text-dim`, …)
onto the new semantic tokens, so the whole stylesheet could take on the new
palette before a single rule in it was rewritten. It is gone: every rule now
names a semantic token directly.

`index.css` is the only file `main.tsx` imports. It declares `@layer design,
app` so `styles.css` (which wraps itself in `@layer app`) always outranks
`tokens/base.css`, whatever order the bundler emits them in.

## components/

The `.tsx` files are ports of `.claude/inkcrafter-design/components/**/*.jsx`,
with each component's `.d.ts` prose folded onto its props interface. Import them
from `components/index.ts`, which is also where `Icon` and `Splitter` are
re-exported from so a screen needs one import line.

`components/contract.test.tsx` pins the class string and element each one emits.
That is the whole point of the port: converting a screen to these components is
meant to be a rename, not a redesign, and the contract test is what makes that
checkable.

### Where the app's version deliberately differs

Anything here that is not upstream has to be written down, or the next
regeneration of the design system silently reverts it.

- **`Field`** renders a `<label>` wrapper by default; upstream renders a `<div>`
  with a sibling `<label htmlFor>`. The implicit association is how 42 controls
  in this app get their accessible name without an id apiece, and ~80 test
  queries depend on it. `as="div"` is for a group holding several controls,
  where a wrapping label would claim all of them for the first one.
- **`Field`** also takes a `note`, rendering an `<em>` *inside* the label. That
  is this app's established treatment — already styled by
  `.ic-field__label em` — and it puts the fact where the eye already is.
  Upstream's `hint`, which sits under the control, is kept as well.
- **`Field`** takes `about` too, which puts the text behind a `Tooltip` mark
  instead. The split is the point: `note` is something the app worked out and
  you may need to check at a glance; `about` is writing that teaches, worth
  reading once. Both come from `shared/copy.json`, and both are sentences.
- **`Thumb`** is a `<span>`, not a `<div>`: these sit inside row buttons and
  paragraphs, where a block element is invalid.
- **`Button`** defaults to `type="button"`. The HTML default is `submit`, which
  has swallowed an Enter key in this app more than once.
- **`Icon`** is the app's own (`design/Icon.tsx`) — upstream fetches each glyph
  at runtime and renders nothing under `connect-src 'none'`.
- **`Splitter`** is the app's own (`layout/Splitter.tsx`). Upstream's is a
  strict subset: no pointer capture, no `body.is-resizing`, no fine keyboard
  step, and no tests.
- **`GroupLabel`** renders an `<h3>`; upstream renders a `<div>`. Every use of
  it — here and in upstream's own screens — names the group of rows beneath it,
  which is what a heading is, and it is how a screen-reader user moves around a
  pane. `as="div"` is there for a label that repeats a heading already given.
- **`Segmented`** is a `radiogroup` of `radio`s; upstream is a `tablist` of
  `tab`s. Upstream's own prose for the component says "not a tab strip: it
  switches a control's setting, not the pane's content" — a tab announces a
  panel that follows it, and these announce a value.
- **`Diagnostics`** rows are `<button>`s; upstream uses `<div onClick>`, which
  no keyboard can reach.
- **`Hint`** takes `tight`, rendering the flush `ic-field__hint` treatment
  rather than the padded block. Upstream has only the block and reaches for an
  inline `style={{ padding }}` when it needs the other (`Diagnostics.jsx`).
- **`CardTitle`** takes an `onClick` and becomes a `<button>` when given one.
  On a plan card the title is the way in to renaming it, and a heading that
  acts on click cannot be reached from the keyboard.
- **`Checkbox`** takes a `trail` — a quiet aside at the right end of the row,
  like the type name on a codex relation. It has to be a sibling of the label
  to sit against the far edge, so it cannot be folded into it.
- **`MasterDetail`** takes `masterClassName` / `detailClassName`. The two
  columns scroll and pad independently and each catalogue sets its own.
- **`Menu`** takes a ref (this app measures the ink menu to flip it near the
  window edge) and a `labelClassName`, because that menu's label carries the
  line it is acting on.
- **`Thumb`** takes a `missingLabel`. Upstream always writes the word
  "missing", which does not fit a 40px media thumbnail.
- **`StatusPill`** is used with no children when the story compiled cleanly.
  Upstream's prose puts "Compiled in 32ms" there; the duration is a fact about
  the compiler rather than about the story, and it re-rendered on every
  keystroke at the edge of vision. The rule it is really keeping — copy is a
  fact with a number, never "All good" — is why the state says nothing at all
  rather than saying "Compiled".
- **`Dialog`** stops the Escape keypress, takes an `ariaLabel` for a title that
  carries an unsaved dot, a `closable` flag for a dialog that must not be
  interrupted mid-write, and a `className` for the two dialogs that size
  themselves.

## Adoption

`adoption.test.ts` is what keeps this from rotting:

- No `.tsx` outside `design/` writes an `ic-` class name by hand. Where one
  has to, the line above says `ic-<family> exception:` and why. There are seven,
  all of them a component with no slot for what the screen needs — a row
  holding an editor, a row with a leading index, a label with a right-aligned
  status.
- Nothing under `design/` calls `fetch`, names an absolute URL, or builds one
  at runtime. The packaged CSP forbids all three, and `apply: 'build'` in
  `electron.vite.config.ts` means it is never enforced under `npm run dev` —
  a violation passes every local check and fails silently in the shipped app.
  Upstream has walked into this twice (`Icon.jsx`, `fonts.css`).
