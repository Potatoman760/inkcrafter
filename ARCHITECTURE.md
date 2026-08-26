# InkCrafter architecture and design notes

This document explains InkCrafter's product model, data formats, process
boundaries, and the reasoning behind its larger implementation choices. For a
short introduction and setup instructions, start with the [README](README.md).
Contributors should also read [AGENTS.md](AGENTS.md) before making changes.

## Product surface

The main parts of the application are:

- **The manuscript** — the branching story read as one continuous novel, with
  every junction shown in place and changeable
- **Projects** — a title, a premise, a tree of ink files, and the codex
  libraries the project draws on
- **The codex** — a story bible of characters, locations, items, lore and
  routes, in libraries shared between projects, with mention detection and
  highlighting
- Editing `.ink` files with ink-aware syntax highlighting
- Live compilation as you type (debounced), with errors, warnings and `TODO:`s
  shown both inline in the gutter and in a problems panel. The **whole story** is
  compiled, not the open file alone — a chapter that diverts into the next one
  would otherwise report every hand-off as a missing target — with the unsaved
  buffer substituted for what is on disk. A file the entry point never includes
  is compiled on its own, so its problems are still reported.
- A playable story preview that recompiles on every edit
- Multi-file stories via `INCLUDE`, resolved relative to the open file
- **Settings** — OpenAI-compatible AI providers, with keys encrypted by the OS
  keystore

## Application model

On first launch, InkCrafter copies the example project and codex library into
the workspace so there is something to open straight away.

### Finding things

```
 Breedhaven  [ Editor │ Manuscript │ Plan ]   ink/main.ink •     Media  Variables  Assistant   Compiled in 12ms
             └─ where you are, one active ─┘                    └── what you can open ──┘
```

The two groups behave differently and are drawn differently on purpose. The
switches on the left _replace_ the working surface and exactly one is active;
the tools on the right open something _over_ it and none of them is ever active.
Made to look the same, the second group would be promising that Media takes you
somewhere, which it does not.

The menus follow the same split. **File** is file operations and nothing else.
**View** is everything you can look at or open, which is where the features live
and where their keyboard shortcuts are. **Settings** stays top level, being
configuration of the app rather than of the story.

Media, Variables and the Assistant used to be in File with no button anywhere, which
is a good way to ship a feature nobody finds.
[menu.test.ts](src/main/menu.test.ts) now checks that every action is still
reachable from somewhere and that no two items claim the same accelerator —
rearranging a menu is exactly the change that loses one silently.

### Projects and libraries

A **project** is the top level: a title, a premise, the ink files it owns, and
the codex libraries it draws on. A **codex library** is a self-contained
collection of entries that any number of projects can link — so one cast can
serve a whole series without being copied into each game.

The dependency runs one way. Projects know their libraries; libraries know
nothing about projects, which is what lets one be copied, versioned or handed to
someone else on its own.

The file list stays put across every view, so a single click loads a file without
moving you — useful beside the manuscript, invisible beside the plan, where
nothing on screen changes. **Double-click** (or Enter) opens it in the editor.

```
data/
  projects/
    the-archive/
      project.md            title, linked libraries, premise
      ink/
        main.ink
        act-one/opening.ink
  codex/
    archive-world/
      library.md            id and title — what projects link to
      characters/wren.md
      locations/the-archive.md
```

`data/` is the workspace: `data/` at the repo root in development, and inside
Electron's per-user data directory in a packaged build, where the repo is
neither present nor writable. It is gitignored (the directory is kept, its
contents are not), so your writing never lands in a commit alongside the app's
source. On a first launch with no projects, [examples/](examples/) is copied in
so there is something to open — that copy is also the clearest documentation of
both file formats.

Anything true of only one story belongs in a library of its own rather than a
shared one, since editing a shared entry reaches every project that links it.
A project can link as many libraries as it likes, so the usual arrangement is
one shared library plus one private to the project.

The **libraries** link in the codex header opens that management: every library
in the workspace with the number of entries it holds — known even for ones this
project never links and so never loads — a checkbox for whether the project
draws on it, and fields for its title and description. Linking applies
immediately, being one line of the project manifest and trivially reversible;
the title and description are a document, so they save explicitly.

There is no delete button. Removing a library means removing its folder, which
is left to the file manager so that a collection several projects rely on cannot
go in one click.

### Everything is linked by id

Sharing forces this. An entry's identity cannot be its file path: renaming a
file in one project would have to fix references in projects that are not open
and cannot be enumerated. So projects, libraries and entries each carry a
generated id — `prj_…`, `lib_…`, `cdx_…` — written into the file once and never
changed. Filenames are then free to be reorganised at will, in the app or
outside it.

The cost is readable frontmatter, which is bought back by writing the referenced
name as a trailing comment. The id is authoritative and the comment is
regenerated on every write, so it cannot drift out of date, and it is ignored on
read:

```yaml
relations:
  - cdx_5t8w1jr4nz # The Archive
```

Files predating ids still load: an entry without one gets an id stamped in, and
relations still written as file paths are rewritten to the ids those paths
resolve to. Both migrations are written back, so they happen once.

### Troubleshooting

**`TypeError: Cannot read properties of undefined (reading 'whenReady')`** — something in
the environment has set `ELECTRON_RUN_AS_NODE=1`, which makes the Electron binary behave
as plain Node, so `require('electron')` returns a path string instead of the API. VS Code
sets this for extension-host child processes, so it shows up when launching the app from a
tool running inside VS Code. Clear it first:

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

**`Error: Electron uninstall`** — the `electron` package's postinstall did not download the
binary. Run it by hand: `node node_modules/electron/install.js`.

## The manuscript

An ink file is a program. It is a poor way to read a story, because the story is
never in one piece — it is scattered across knots, and the reading order only
exists at runtime.

**View ▸ Manuscript** (`Ctrl+2`) renders one path through the story as continuous
prose. Junctions appear inline as cards listing every option, not only the one
taken, because a branch you cannot see is one you cannot reconsider. Choosing
extends the reading to the next junction; choosing again at an earlier one
discards everything below it, since that text described a path no longer taken.

Codex names are underlined in the prose and open their entry. Hovering a
paragraph reveals its source line in the margin, which jumps to that line in the
editor.

### Drafting a section with a model

Click a paragraph to select its **section** — the run of narration between two
choices, which is the closest thing the manuscript has to a scene. The **Write**
tab then drafts it: an instruction, a length (200 / 400 / 600 words), and a model
picker that defaults to the active provider from Settings while letting you
override it per draft, using the same searchable list.

The system prompt is short, and everything in it is there because a model that
gets it wrong costs real work:

- **A paragraph is a beat.** Each paragraph lands as one line of ink, and one
  line of ink is one screenful the reader clicks through. So paragraph length is
  pacing, not style, and a model writing novel-length paragraphs is writing a
  visual novel that stops dead three times a scene. This is the instruction that
  changes the output most.
- **Dialogue has two safe shapes** — speech quoted inside the narration, or
  `Wren: "You're late."` on its own line. Both compile and reach the reader
  exactly as written.
- **Never write ink syntax.** The draft is pasted into a source file, so a stray
  `*` becomes a choice and a stray `->` sends the reader elsewhere. Drafts are
  also filtered on the way in, because a model told not to do this mostly obeys.
- **Write one section; someone else writes the choices.** No offering the reader
  options, no ending on a question that implies a choice list.
- **This is one path, not the story.** Other readers reach this scene having done
  other things and continue to endings the model cannot see, so it must not
  resolve the plot, foreshadow an ending, or refer to a decision the reader may
  not have made.

### What ink does to prose

[inkProse.ts](src/shared/inkProse.ts) is the one list of what prose may contain,
read by the prompt that asks and the filter that enforces. Keeping them apart is
how a model gets told one thing and judged by another, and the author watches
paragraphs disappear from a draft that obeyed its instructions.

Every rule in it was run through the real compiler, and the interesting split is
not syntax versus prose but **loud versus quiet**:

|                           | Written                               | Reader sees                       |
| ------------------------- | ------------------------------------- | --------------------------------- |
| Loud — the build stops    | `She counted {one} thing.`            | a compile error                   |
| Quiet — the build is fine | `The address was http://example.com.` | `The address was http:`           |
| Quiet                     | `She was in Room #3 by then.`         | `She was in Room`                 |
| Quiet                     | `- I told you, she said.`             | `I told you, she said.`           |
| Quiet                     | `* She arrives.`                      | a _choice_ reading "She arrives." |

The loud ones are harmless in practice: the author sees them immediately. The
quiet ones are the reason the filter exists, and the old one caught `//`, `#` and
`{` only at the start of a paragraph — so a URL mid-sentence went straight
through and silently ate the rest of the line.

It cuts the other way too. `>` was on the ban list and is not ink syntax at all,
so a paragraph opening with one was thrown away for nothing. `DONE` and `END`
went on the list while this was being written, on the assumption that they were
keywords; the compiler says they are only diverts after a `->`, and as words they
survive untouched. "END of the line, she thought." is a sentence, and the list is
now short enough to be defended line by line.

[inkProse.compile.test.ts](src/main/manuscript/inkProse.compile.test.ts) holds
that honest in both directions: everything allowed must compile and read back
word for word, and everything rejected must genuinely be mangled — or the filter
is deleting good writing.

Context is the manuscript itself: the prose along this exact path, in order, with
the choices that were taken marked between the sections, then the section's
current text and your instruction.

### Which codex entries go with it

Everything the model will read — story, section and instruction together — is
scanned for codex names and aliases, and whatever is found is sent ahead of it as
established fact. Scanning what is actually being sent, rather than the
manuscript document, is what makes a character named in the scene but absent from
your instruction still arrive with their description attached.

Each entry's **AI context** decides its part: `always` is sent whether named or
not, `detected` only when named, `never` under no circumstances. A named entry
also brings the entries it is related to — one hop, so a tavern brings its
barkeep and not the barkeep's every acquaintance, and `never` still wins.

Within an entry, a **detail** marked `detected` is only shown when the entry was
named outright, so one reached through a relation contributes its description
without its specifics. **Notes are never sent**, which is the entire promise of
that field.

Selection is deduplicated by entry id throughout, so an entry that is both
`always` and named — or named and also related to something else named — is sent
once. Two libraries can still each hold a "Wren"; the ids differ, so both are
sent, and the library name is added to each heading so the model can tell two
otherwise identical, contradicting entries apart. The codex panel warns about the
clash separately.

The block is capped, so a large codex cannot crowd out the story it describes.

The instruction box **underlines the codex names it recognises** as you type, and
the panel lists every entry that will accompany the draft — those named outright
shown differently from those arriving because they are set to `always` or are
related to something named. That list is computed by the same code the main
process uses to build the prompt, in [codexContext.ts](src/shared/codexContext.ts),
rather than a second implementation that would eventually disagree with it.

Applying a draft comes in two strengths. **Insert after** adds lines and destroys
nothing. **Replace section** overwrites the span, so it is offered only when
every line in it is plain prose — a conditional, a function call or a variable
assignment sitting between your sentences is structure the draft knows nothing
about, and the button explains which line blocked it.

### Tracing a path to a knot

"How does the reader ever get to this ending?" is the question an ink file is
worst at answering. The route is spread across choices in other knots, and
working it out means reading backwards through diverts — exactly the labour this
tool exists to remove.

So **Ctrl-click a knot or stitch header** in the editor. The story is searched
for a sequence of choices that reaches it, and the manuscript opens with that
whole path already made. Where several routes reach the same knot, any of them
is a correct answer and the shortest is taken, which is both the quickest to find
and the least arbitrary-looking. The header says which knot was traced and in how
many choices.

Modified-click rather than a plain one, so that clicking a header still places
the cursor and the header stays editable — the same gesture as codex mentions in
this editor, and as go-to-definition elsewhere.

The search is breadth-first over choices, using state snapshots to backtrack. It
treats two states as the same when the story stands in the same place facing the
same choices, which is what keeps a story with loops finite; the cost is that a
route depending only on a differing variable could be missed. It gives up, and
says so, rather than running forever on a story that branches faster than it can
search. `function` headers are not linked, because a function is called rather
than travelled to.

### Writing from the manuscript

**The ink file is the save format, always.** The manuscript and the editor are
two windows onto the same text, and either can write to it — there is no
generated artifact and no second document to keep in step.

Double-click a line to rewrite it. The edit replaces the exact span that produced
that text and nothing else, then the story is recompiled and your path replayed,
because an edit can shift every line number after it.

A line can be rewritten when its rendered text appears **verbatim, exactly once**
in its source line. That is the whole safety argument: one occurrence proves the
mapping is one-to-one, so a replacement cannot disturb anything around it. It
turns out to permit more than it first appears — the chosen branch of
`{has_lantern: A|B}` is present verbatim, so editing it rewrites that
alternative and leaves the condition and the other branch intact.

What it excludes is text the runtime _assembled_ rather than read: a function's
return value, an interpolated variable. There is no span in the file to replace,
so those lines are shown locked with the reason, rather than mangled. Edit them
in the ink.

Edits are also refused when the source line has changed since it was read —
edited in the other view, or by another program. A stale anchor must never
overwrite whatever now occupies that line.

### Why it runs in the main process

Every paragraph and choice knows the file and line that produced it. That
mapping comes from ink's debug metadata, and it exists **only** on the in-memory
`Story` the compiler returns: `engine/JsonSerialisation` never writes it, so a
story reloaded from JSON has none. The manuscript therefore drives the compiler's
own story object in the main process. The [story preview](src/renderer/src/player/StoryPlayer.tsx)
still runs from JSON in the renderer — it is a play-test and needs no anchors.

Two consequences worth knowing:

- **The manuscript reads from disk**, so switching to it saves the editor first.
  A reading of unsaved text would not match the story anyone else would get.
- **Text assembled at runtime anchors to its call site.** A paragraph produced by
  `{archivist("You're late.")}` cannot point inside the function — the string is
  built during evaluation and has no source of its own — so it points at the line
  that called it, which is where the line appears in the story anyway.

A stretch between two junctions is capped: `-> knot` cycles with no choice in
them are ordinary ink, and this runs in the main process, where an unbounded loop
would take the whole app rather than just wedging a view. Hitting the cap ends
the reading with a note saying so.

## The plan

**View ▸ Plan** (`Ctrl+3`) is the story's structure: acts holding chapters
holding scenes, modelled on
[novelcrafter's plan views](https://www.novelcrafter.com/help/docs/plan/plan-views).

**Grid** is the board — acts as columns, chapters as cards carrying a summary, a
status, tags, and the characters in them. Cards edit in place. **Matrix** is the
character tracker: characters down, chapters across, a mark where each appears.

Characters are tracked rather than typed. A chapter's cast is whoever the codex
recognises in its summary and in the summaries beneath it — the same detection
the AI context uses, so what the board shows a character to be in is what the
model would be told.

### Why JSON and not markdown

`plan.json` in the project directory. Only the ink is a format anyone else needs
to read, and holding the plan as markdown cost more than it returned:

- **Node identity had to be positional.** An id like `1.2.1` shifts whenever
  anything above it moves, so anything referring to a node would silently
  repoint. Ids are now generated once and stable however the plan is rearranged.
- **Fields competed with prose.** A `status:` line was a field, so a summary
  beginning "Note:" was ambiguous. In JSON a summary is a string and can contain
  anything at all.
- **Every save round-tripped through a parser** that had to reproduce the file
  faithfully. That risk is simply gone.

Markdown survives as an **import**, which was the genuinely useful part: an
outline drafted in a notes app, a chat, or a structure template pastes straight
in — heading level for hierarchy, text beneath for the summary. A project written
before this change has its `outline.md` imported once, automatically.

The right-hand panel shows the nesting and each Scene's Ink knot. Names claimed
twice are called out because every Scene becomes authored Ink and knot names must
be unique.

### Scenes and Ink ownership

Acts and chapters are planning containers. A **Scene** is the authored unit: it
has its own description, its own stable plan id, and exactly one Ink file. The
app creates the file and its knot at the same time as the Scene and adds the
required `INCLUDE` to the project's entry point. The planner never offers an
attach, detach, or replace-file control for this relationship.

Removing a Scene removes it from the plan but does not delete its Ink file. It
therefore becomes unassigned and can be recovered or edited independently.
Authors can also create arbitrary Ink files in the Files pane without placing
them in the plan.

Files that belong to the story rather than any section — an overworld map, shared
functions, global variables — are marked **global**. That is a deliberate mark
rather than an absence, so a file nobody has placed yet stays visible as
**unassigned** instead of quietly passing for global. All three are shown in the
plan's side panel, and a file can be opened in the editor from either place.

The Scene path lives in its `files` array in `plan.json`; keeping the version-one
shape makes old plans readable. On first read, old act attachments become global
and old chapter attachments become child Scenes without changing the Ink file's
path or contents. Missing Scene files are materialised automatically.

### Expanding a section

The card on the board is a summary. **⤢** opens the section itself. Acts and
chapters show what they contain; Scenes show their description, Ink path, and
knot declaration. Clicking the path opens that file in the editor.

Editing here is a draft: **Cancel** backs out, asking first if anything changed,
and **Save** is the only thing that writes. The cards on the board take `Escape`
to the same end.

### Plan context for the AI

When a section is drafted, the prompt carries where that section sits: its
ancestry, what its chapter is meant to accomplish, and what follows.

```
PLAN — where this section sits in the story.
Act One › Inside (chapter)
This chapter: The shelves, and the woman who keeps them.
The act "Act One": A locked building, and someone who should not be inside it.
What follows: The ledger — the page she was not meant to see.
Lead towards it without arriving there; the next section covers it.
```

Ancestry, the node, and the _next sibling only_ — never the whole plan, which
would tell the model how the story ends in the same breath as asking it not to
resolve anything.

Matched by knot: a plan node's knot comes from its title, a manuscript section's
from the ink it was read from. A section opens with the text of the choice that
led into it, and that text still belongs to the knot being _left_, so the knot
contributing the most lines is taken as the subject — otherwise every section
would be filed under the chapter before it. When nothing matches, the block is
simply absent.

## The codex

A story bible living beside the story, modelled on
[novelcrafter's codex](https://www.novelcrafter.com/help/categories/codex) and
adapted for visual novels. Entries come in six types — characters, locations,
items, lore, **routes** (a visual novel's equivalent of a prose subplot) and
other.

Each entry has a name and aliases, a markdown description, labelled _details_
with their own AI visibility, tags, relations to other entries, private notes,
and tracking settings. Names and aliases are underlined wherever they appear in
your story; Ctrl-click one to jump to its entry. The sidebar shows a live
mention count per entry.

**Double-click an entry to edit it.** Editing opens a dialog rather than filling
a side pane, because the codex matters just as much while reading the manuscript
as while writing ink, and a pane that only exists in one view is a pane that
silently does nothing in the other.

Single-clicking selects an entry and expands it in place, under its own row.
What it shows is the **names**: what it is called, what it also answers to, and
its tags — the things the app detects in your prose — plus how often it is named
in the open file, and an Edit button. Deliberately not the description: this is
a narrow column beside a list you are still using, and a character's prose
belongs in the editor where there is room to read it rather than pushing the
rest of the list off the bottom.

The dialog is the one surface in the app that does not autosave: edits are held
as a draft until you press Save, so a change can be backed out. Closing with
unsaved work asks first, and `Ctrl+S` saves.

### Storage

One markdown file per entry, inside a library, nested into folders however you
like. The file's location is filing, not identity — moving it changes nothing
else.

```markdown
---
id: cdx_9m2q7fk3bs
name: Wren
type: character
aliases:
  - The Archivist
tags: [archive, staff]
aiContext: detected
tracking:
  byName: true
  caseSensitive: false
  exclusions: []
relations:
  - cdx_5t8w1jr4nz # The Archive
details:
  - label: Voice
    value: Dry and unhurried.
    ai: always
---

Wren has kept the archive for thirty years.

<!-- codex:notes -->

Private scratch space. Never sent to the model.
```

Nothing here is InkCrafter-specific: the files stay readable, greppable and
diffable in any editor. See [the example library](examples/codex/archive-world/).

### Mention detection is ink-aware

This is where a codex for ink has to differ from one for prose. An ink file is
part story, part program, and matching entry names everywhere produces
nonsense — a character called Wren would "appear" in the divert `-> wren_route`,
the variable `wren_trust`, and the comment reminding you to rewrite her
introduction.

So [mentions.ts](src/shared/mentions.ts) scans only the parts of the file the
player actually sees. Comments, tags, declarations, `~` logic lines, knot and
stitch headers, choice bullets, labels and divert targets are all excluded, as
is the logic inside `{...}` — while the _text_ inside a conditional is kept, so
in `{cold: You shiver.}` the condition is skipped but "You shiver." is scanned.

On top of that, matching follows novelcrafter's rules: aliases, longest term
wins, optional case sensitivity for names that are also ordinary words ("Red",
"Storm"), an exclusion list for false positives (a character called "Will"
against the auxiliary verb), and common English plurals without needing a
separate alias.

### Not yet implemented

**Progressions** — novelcrafter's mechanism for revealing entry changes only
from a given point in the manuscript onward, so the model cannot spoil a
development that has not happened yet. It needs a notion of "where you are in
the story"; in ink the natural anchor is the knot, which is a good fit but not
built yet.

Also absent: entry images (visual novels want character sprites), binding
entries to ink tags such as `#char:wren`, and a series-level codex shared across
stories.

## Drafting ink in the editor

The editor's **Write** tab is the manuscript drafter's opposite. There the model
writes prose and is forbidden structure, because the author owns the shape of the
story. Here structure is the request — choices, diverts, knots — so the prompt
has to teach ink rather than ban it.

There is no word limit either. It would only be a number to ignore when the
useful answer might be three lines of choice or a whole knot.

### A builder, not a box

What will be sent is listed before it is sent: this file, what your selection
would replace, what the plan says the file is for, and the codex entries
recognised in it. Each line says plainly when it is _absent_ — "not attached to
anything in the plan" — because a context you assumed was there and was not is
the hard thing to debug from the answer alone.

The context is narrow on purpose. A model given the whole story writes to the
whole story. The panel and the main process both call `selectCodexEntries`, so
what is listed cannot drift from what is sent.

### The bracket

One piece of ink syntax fails _silently_, and it is the one this feature exists
to write:

| Written                    | The choice reads | Printed once taken   |
| -------------------------- | ---------------- | -------------------- |
| `* Try the handle`         | Try the handle   | `Try the handle`     |
| `* [Try the handle]`       | Try the handle   | nothing              |
| `* "Hello[."]," she said.` | `"Hello."`       | `"Hello," she said.` |

Both compile. They tell different stories. So the rule — before the `[` appears
in both, inside appears only in the list, after the `]` appears only once taken —
is stated in the prompt and
[checked against the compiler](src/main/ai/inkPrompt.test.ts), which plays each
form and asserts what the reader actually sees. A prompt that teaches a language
is making claims about it, and claims about a compiler are worth nothing until
the compiler has been asked.

### Compiled before it is offered

Ink can be wrong in a way you cannot see by reading it. A divert to a knot that
does not exist, a knot redefined, a path that runs off the end — all ordinary
mistakes for a model, all fatal, none obvious in a fifteen-line draft.

So the draft is compiled where it would land: spliced over your selection if
there is one, appended otherwise, and run through the _project's entry point_
with the file overridden, so a divert into another file resolves the way it will
once saved. The panel then says **compiles where it would go**, or shows the
error.

**Reported, not enforced.** A draft that does not compile is usually still most
of what you asked for, and you can fix it faster than the model can. Insert stays
enabled; the draft box is editable first.

The prompt also names the knots the file already declares, functions excluded —
inventing a divert to a knot that does not exist is the most common way an
otherwise good draft fails, and a function is called rather than travelled to.

## Variables, items and the catalogue

**Game Manager ▸ Variables** manages stats, hidden vars and items. A **stat** is an
ink `VAR` shown to the player; a **var** is an ink `VAR` used only by story logic.
Either may be a number, a yes/no flag or a piece of text. An **item** is a member
of an ink `LIST`, and everything carried goes into one inventory variable, which
is what makes `{inventory ? shovel}` work whichever list the item came from.

Each category becomes its own `LIST`. One list of a hundred names is unreadable;
`LIST Tools = shovel, rope` is how an author already thinks about it.

```
projects/the-archive/
  stats.json          the catalogue — what you edit
  ink/state.ink       the declarations — generated
  export/
    catalogue.json    the metadata — generated
```

Generated, not scanned. That is the opposite of how the plan and the codex work,
and it is right here for one reason: nobody hand-declares a hundred inventory
items so that a dropdown can know about them. Regenerating `state.ink` whole is
safe precisely because it holds nothing else — there is no authored prose in it
to preserve, so there is no round trip to get wrong.

Ink puts stats, vars, items, list types and the inventory variable in **one
namespace**, so a name is checked against all five before it is committed, and
the identifier it will become is shown while you type it: `Brass Key` →
`brass_key`.

### Names are committed on blur

Every name field here — a stat, an item, a category, the inventory variable —
holds a local draft and commits when it loses focus. Applying on each keystroke
would rename the entry to a _prefix_, regenerate the ink, and do it again on the
next letter: a hundred saves for one rename. It also makes clearing the box to
retype impossible, since the empty value is rejected and snaps back.

Renaming keeps the id, so nothing pointing at the entry has to be repointed. What
it cannot do yet is fix the ink already using the old name, so it says where to
look instead — every line mentioning the identifier, with a link that opens it.
Rewriting those lines needs to tell a `shovel` in a condition from the word
"shovel" in a sentence, which is what `proseRanges` in
[mentions.ts](src/shared/mentions.ts) does, inverted. That belongs with the
choice scanner rather than bolted on here. Renaming into a broken build with no
warning is the bad outcome; renaming with an accurate list of what to fix is
honest today.

### Writing ink with it: right-click

The catalogue exists so the editor can write correct ink without you remembering
a name or a type. **Right-click in the ink editor** and what is on offer depends
on where the click landed:

```
 * [Dig]                          ┌──────────────────────────────┐
     -> the_hole                  │ Choice on line 31            │
                                  │ Require…                     │
                                  │ Give item…                   │
                                  │ Take item…                   │
                                  │ Change variable…             │
                                  └──────────────────────────────┘

 Require ▸ shovel  →  * {inventory ? shovel} [Dig]
 Give item ▸ shovel →      ~ inventory += shovel
```

Gating needs a choice; giving an item or changing a stat can happen anywhere a
line can, and lands on its own when there is no choice under the pointer. An
effect on a choice goes at the _top_ of its body, because a line placed after the
divert at the end would never run.

**The cast is stats too.** Everything in `npcs.json` — Abeline's affection, her
status, whether she is expecting — appears in the same picker as the player's
stats, grouped under the character's name, so filtering for `affection` finds it
without knowing that `abeline_affection` is what the generated ink called it.

Two steps, not nested submenus: pick the action, then pick the stat or item from
a filtered list. At a hundred items a hover-submenu is unusable and the filter
has to be there from the first keystroke. What will be written is shown before it
is written.

### It knows what you clicked

What is offered depends on what the cursor landed on, and that is the point
rather than a nicety — on a `# bg:courtyard` line, "change stat" is not a near
miss, it is an option that cannot mean anything there.

| Clicked on                       | Offered                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| A choice                         | Require · Give / Take item · Change variable · Set background · Show character |
| A media tag                      | Change which · Change the look · Remove this tag line — and nothing else       |
| A `# stat:` or `# npc:` change   | Change which · Change what it does · Remove this line                          |
| A `~` stat change or item action | Change which · Change what it does · Remove this line                          |
| Other logic, prose, a header     | Set background · Show character · Clear the character · the effects            |

A media tag also edits **in place**: changing the look rewrites `bg:the_cove/night`
to `bg:the_cove/day` without touching the rest of the line, and the looks on
offer are only those of the asset the tag already names.

A `~` line edits the same way. Right-click `~ strength = strength + 1` and the
dropdowns open _on what is already there_ — "add", amount 1 — so turning a reward
into a cost is one change rather than a delete and a re-add. Changing which stat
keeps the operation where it still means something, and drops it where it does
not: retargeting onto a yes/no stat gives `~ has_met_wren = true`, since there is
no adding one to a flag. `~ inventory += brass_key` offers items and give-or-take;
the stat line offers stats. The tilde and the indentation are never part of what
gets replaced.

### Two channels, and which one a change goes down

A story has two ways to move a number, and they are not interchangeable:

|                           | Written   | Applied by                               | Clamped?                       |
| ------------------------- | --------- | ---------------------------------------- | ------------------------------ |
| `# stat: courage +1`      | a tag     | the game — `StatsManager` / `NpcManager` | yes, to the catalogue's range  |
| `~ courage = courage + 1` | ink logic | ink itself                               | no; ink cannot express a range |

The menu writes **tags for changes and ink for gates**, because that is what each
half can do. Only ink can branch, so a gate is always
`{abeline_affection >= 2}`. But only the game knows that affection stops at ten,
so a change goes out as `# npc: abeline affection +2` and the game clamps it,
notifies the HUD, and writes the result back into the ink variable — which is why
the gate reads the right number a moment later.

The line falls where it does because of what can own a value. Every cast
attribute has a manager. A player stat only has one when it is a _number_ —
`# stat:` carries an integer and nothing else — so a yes/no or a piece of text is
written `~ has_met_wren = true`, which is the honest thing rather than a tag
nothing would read. `~ inventory += shovel` is unchanged for the same reason: ink
owns the `LIST`, and there is no clamp to apply. Which is which lives in
[trackables.ts](src/shared/trackables.ts), derived from both catalogues and
stored nowhere.

A status is bare in the tag and quoted in the gate — `# npc: abeline status =
married` stores the ink string `"married"`, so the condition needs `== "married"`.
Getting that right without being told is the whole reason the catalogue is
involved.

**The preview applies them too.** ink treats a tag as an opaque string, so
without this the editor's preview plays a story where nothing the reader does
ever counts, and every gate stays shut. `StoryPlayer` applies `# stat:` and
`# npc:` between `Continue()` calls with the same clamping the game uses — the
[same code](src/shared/trackables.ts), so a branch cannot open in one and not the
other.

### The tag that arrives one line late

ink attaches a standalone tag to the **next text line**. Usually that is exactly
right. It is silently wrong when the next thing the reader sees is the branch
that reads the variable:

```ink
* [Step forward]
    # npc: abeline affection +2
    -> the_vow                     ← the gate in the_vow is evaluated first
```

The tag reaches the game on the same `Continue()` that already produced the
gate's output, so Abeline gives the distant reply — and the value is correct
immediately afterwards, which is what makes it so hard to see. One line of prose
between the tag and the divert fixes it:

```ink
* [Step forward]
    # npc: abeline affection +2
    She smiles.
    -> the_vow                     ← now the tag lands on "She smiles." first
```

Both arrangements are [run against the compiler](src/main/stateTags.compile.test.ts)
rather than reasoned about, and `preflight` warns about the first — but only when
the landing really is a branch on that variable, since a tag before a divert is
otherwise the most ordinary thing in the file.

**Tags go above the line they govern.** ink attaches a standalone tag to the text
line that _follows_ it, so a background written below its prose would come up one
line late — and would look right most of the time, which is worse than being
obviously wrong. On a knot header it goes below instead, since above would put it
outside the knot entirely.

**The menu composes; it never parses** — for conditions. Adding a second
condition to `{a}` produces `{a and b}` by carrying the existing text across as a
substring, so a hand-written `{inventory ? shovel and LIST_COUNT(pack) < 3}`
survives being added to, exactly, because nothing ever takes it apart.

**Where it does read, it reads only what it wrote.** `parseEffect` recognises the
handful of shapes the renderers produce and returns null for everything else, so
`~ trust = trust + roll(6)` and `~ archivist("You're late.")` stay plain logic
lines with no offer to reshape them. The discrimination that earns this is a
backreference: `strength = strength + 1` is an increment of `strength`, while
`strength = nerve + 1` is an expression that merely starts the same way, and
turning the second into two dropdowns would rewrite it into something the author
never wrote. Every renderer output is
[asserted to parse back identically](src/main/inkEdits.test.ts) — the reader and
the writers drifting apart would quietly halve the feature rather than fail.

A yes/no stat gates as the bare name rather than `== true`, which is what an ink
author would have written. Every form the menu can produce is
[compiled in the tests](src/main/inkEdits.test.ts), because "reads like ink" and
"is ink" are different claims.

### What the export is for

Not a copy of the compiled story. `Story.ToJson()` writes three keys —
`inkVersion`, `root`, `listDefs` — and `listDefs` is the complete
`{ "Tools": { "shovel": 1, … } }` map, so an engine loading the story already has
every category and every item name.

|                              | In the story JSON?                                    |
| ---------------------------- | ----------------------------------------------------- |
| Item and category names      | **Yes** — `listDefs`                                  |
| Stat names, types, defaults  | No. Only as bytecode inside a `global decl` container |
| Display names, blurbs, icons | No — they never reach the ink at all                  |

So `export/catalogue.json` is the metadata layer ink has no way to hold, and its
most valuable property is that it **joins** to the story: every item carries the
`list` it will appear under in `listDefs`, so an engine can line the two up
without guessing. That join is
[tested against a real compile](src/main/stats.test.ts) rather than asserted —
including the case where a category name is not a legal ink identifier and
`Key items` becomes the list `Key_items`.

`custom` fields are free-form pairs the app stores and never interprets. They are
an ordered array while being edited — a half-typed label is not a key collision —
and an object in the export, which is the shape a reader wants. The conversion
happens once.

## Media

**Game Manager ▸ Media** manages the characters and backgrounds a story shows. Images
live in `media/` inside the project; `media.json` beside it says which file is
which.

```
projects/breedhaven/
  media.json          the catalogue — names, files, looks, tags
  media/
    sprites/kael-neutral.png
    sprites/kael-wary.png
    bg/portal-day.png
```

A character is **one asset with named looks** rather than one asset per image.
`kael` with `neutral` and `wary` is how a visual novel is written; three
unrelated entries called `kael_neutral`, `kael_wary` and `kael_hurt` have nothing
tying them together and nothing to offer a picker. Backgrounds work the same way,
which is what gives you a `day` and a `night` version of one place.

Music and sound effects are simpler: each named asset points directly to one
audio `file`. They have no looks or variant picker. A track is written as
`# music:theme`, and a one-shot cue as `# sound:door_slam`.

### Media reach the story as tags

This is the catalogue with the least to say to the ink. Variables become `VAR`
declarations and items become `LIST`s — a story will not run without them. Media
generate nothing at all: a sprite reaches the story as a tag, which inkjs hands
back through `currentTags` untouched.

```ink
=== chapter1 ===
# bg:the_portal/day
# char:kael/neutral
The portal spat Kael out like something it couldn't digest.
```

Video backgrounds loop by default. Add `once` to play one through a single time
and leave its final frame on stage: `# bg:the_portal/opening once`. The scene
rail exposes the same option as **Play once and hold the last frame**.

`kind:name/variant`. A bare `# char:kael` takes the first look, which is why look
order is more than presentation. `# char:none` clears the slot — the only way to
say nobody is on screen, because an empty tag set already means _unchanged_.

Tags apply **cumulatively**, the way a visual novel reads: a background set three
paragraphs ago is still what the reader is looking at. And the grammar is
deliberately narrow — anything that is not one of InkCrafter's media keys is left alone,
because ink already carries tags for other things. The archive example has
`#trust:{archivist_trust}`, and ink interpolates that _before_ handing it over,
so what arrives is `trust:-2`. A parser that claimed unknown prefixes would start
eating those.

### The preview draws it

**View ▸ Editor**, the Preview tab: the story runs and the stage above the
transcript shows the background with the character over it. That is the point of
the whole feature — you can see whether `# char:kael/wary` shows Kael, wary.

Two failures are worth telling apart, and the stage says which is which: a tag
naming something **not in the catalogue**, and a catalogued look whose **file has
gone from the folder**.

### Why images need a scheme of their own

The renderer cannot point an `<img>` at a file on disk. In development the
document is served over `http:`, and Chromium refuses a `file:` subresource from
a non-`file:` document whatever the CSP says. In a packaged build the document
_is_ `file:`, but `img-src 'self'` covers the bundle and the workspace lives
outside it.

So images are served over `app://media/<path>`, resolved under the workspace and
nowhere else by [mediaProtocol.ts](src/main/mediaProtocol.ts), with `app:` added
to `img-src`. The renderer names a file and the main process decides whether that
name may become one — the same arrangement the assistant's tools work under.

Chosen over base64 `data:` URIs, which would have needed no protocol at all:
those inflate by a third, hold every sprite in a JS string, and cross IPC again
on each render. Fine for an icon, wrong for an asset pipeline. Note that `app:`
is registered as a **standard** scheme, which matters more than it looks — a
non-standard scheme has an opaque origin that CSP will not match, and the images
would be blocked with no obvious reason why.

### Files arrive by being put there

There is no import button. The app scans `media/` and lists what it finds, so you
add images with Explorer, a drawing tool's export dialog, or a sync folder — the
same bargain the codex strikes by leaving deletion to the file manager. The
dialog shows what is **not filed yet** alongside what is, which are the two
states worth seeing.

## The assistant

**Assistant** (`Ctrl+K`) is a chat that can act on the workspace rather than only
talk about it. Ask it to _create a new project with five chapters and seed each
one with an ink file_, and it does — reading what is already there, generating
proper ids, and writing the files.

It has four tools: `list_files`, `read_file`, `write_file` and `new_id`. Few on
purpose. A model given twenty narrow tools spends its turns choosing between
them; the workspace is only files, so read, write, list and an id generator can
build anything in it.

It is a dialog rather than a pane, for the reason the codex editor and the
library manager are: a pane belongs to one view, and a control that opens one is
silently dead in the others. A _general_ assistant that stopped working in the
manuscript would not be general.

### Two tools that are not file writes

Everything else the assistant does is a file write, on purpose. These two exist
because writing the file is _not enough_, and getting that wrong fails silently:

| Asked for           | Why a write_file is not enough                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write_variables`   | `stats.json` alone declares nothing. The `VAR` and `LIST` lines live in a generated `ink/state.ink` the entry point has to INCLUDE, and only saving through the app regenerates it. |
| `write_codex_entry` | An entry needs a library that exists, a unique id, and the project to _link_ that library — three files, one outside the project. An entry in an unlinked library is never loaded.  |

Both **merge** rather than replace: there is no undo in this workspace, and a
model that omits a field should not thereby delete a character. Both take prose
names and clean them — "Brass Key" becomes the identifier `brass_key` while
keeping "Brass Key" as the display name.

And `write_file` now **refuses** the files those tools own — `stats.json`,
`ink/state.ink`, `export/catalogue.json` — naming the tool that does it properly
rather than letting a write through that would be silently undone or silently
inert. The same choice as the missing-INCLUDE diagnostic: explain, do not accept.

### The boundary

Every path it names arrives as an arbitrary string from a remote service, so
[workspacePath.ts](src/main/ai/workspacePath.ts) is the part of the feature worth
reading. It whitelists rather than looking for `..`: blacklists lose to
encodings, and `%2e%2e`, `..\`, a NUL, a drive letter, a UNC share and an
alternate data stream are all ways out of a directory. A segment that is not
plainly a name is refused without trying to work out what it meant, and the
result is then confirmed to be inside the root regardless. The tests are written
as attacks rather than as typos.

Two further limits. Writes are confined to `.ink`, `.md`, `.json` and `.txt` —
there is no reason for the assistant to be able to drop a `.js` into your data
directory. And **an existing file is never replaced without `overwrite: true`**,
which the model has to ask for deliberately; `data/` is gitignored, so an
overwrite is not recoverable.

The whole loop runs in the main process. The renderer has `connect-src 'none'`,
has never held the API key, and is not going to be handed the filesystem on a
remote service's say-so.

### What it did, not just what it said

Every tool call appears in the transcript as it happens — `wrote
projects/the-signal/ink/chapters/arrival.ink (214 chars)` — and clicking one
shows the arguments. This is not behind a toggle. A file appearing on disk with
no visible cause is the thing that makes a tool like this untrustworthy, and a
failed call is shown as loudly as a successful one.

Two caps stop a runaway: twelve rounds of tool calls per turn, and sixty calls
in total. A model that has lost the thread will otherwise call `list_files`
until the tokens run out, and it is you paying for that. When a cap is hit the
turn still returns, and still reports everything it wrote — silently dropping
that record would be worse than the runaway.

### Knowing the formats

The assistant writes the app's own files, so the system prompt carries an example
of each: `project.md`, `plan.json`, a codex entry, `library.md`, and a working
ink file. A format described wrongly there fails _quietly_ — the file parses, a
field is missing, and a project has no title until someone notices.

So the examples are exported from
[chatPrompt.ts](src/main/ai/chatPrompt.ts) rather than inlined in the prose, and
[chatPrompt.test.ts](src/main/ai/chatPrompt.test.ts) puts each one through the
reader that will actually meet it: `readProject`, `parsePlan`, `loadEntries`, and
the ink compiler. The ink example is played to the end down both branches, because
"it compiles" and "it reaches an ending" are different claims.

[chat.test.ts](src/main/ai/chat.test.ts) then runs the whole loop against a
scripted provider doing the five-chapter task above, and opens the result with
`listProjects` and the compiler. Everything after the HTTP boundary is the real
code.

## AI providers

**Settings** on the menubar opens application settings. Its first tab configures
providers speaking the OpenAI protocol — OpenAI itself, OpenRouter, a local
Ollama or llama.cpp. Each has a name, a base URL, a model and a key; one is
marked active. **Test connection** calls `GET {baseUrl}/models`, the one endpoint
every OpenAI-compatible API agrees on, and reports what came back.

The model field is a searchable picker fed by that same endpoint. Aggregators
return a lot — OpenRouter currently lists over 400 — so it filters as you type,
matching each whitespace-separated term independently: `gpt 4o` finds
`openai/gpt-4o-mini` without reproducing the punctuation. Exact and prefix
matches rank first. Arrow keys move, Enter selects, Escape reverts. Anything not
in the list can still be typed and used, for endpoints that do not advertise
everything they serve.

The base URL must include the version path (`https://api.openai.com/v1`,
`http://localhost:11434/v1`). Only a trailing slash is trimmed — implementations
disagree on where the version sits, so the app does not guess.

### Where the key lives, and where it does not

Settings are stored at `settings.json` inside Electron's per-user data directory,
**not** in `data/`. The workspace holds writing: portable, gitignored, copied
between machines. A machine-bound credential would not survive that trip and has
no business travelling with a manuscript.

The key is encrypted with Electron's `safeStorage` — DPAPI on Windows, Keychain
on macOS, libsecret on Linux. If the OS keystore is unavailable the app **refuses
to store the key** and says so, rather than quietly writing cleartext a user
believes is encrypted.

More importantly, the key is never sent to the renderer at all. Loading settings
returns `hasKey: boolean` in its place, and writing one is a separate write-only
call with no matching read. That is why the API key field cannot show you the
saved value — the window it renders in has never seen it. Combined with the
`connect-src 'none'` CSP, requests can only originate in the main process, which
keeps that boundary real rather than decorative.

## Stack

| Layer  | Choice             | Notes                                                                              |
| ------ | ------------------ | ---------------------------------------------------------------------------------- |
| Shell  | Electron           | Same foundation as inkle's own editor, Inky                                        |
| Build  | electron-vite      | Vite for all three processes                                                       |
| UI     | React + TypeScript |                                                                                    |
| Editor | CodeMirror 6       | Custom ink stream-mode in [inkLanguage.ts](src/renderer/src/editor/inkLanguage.ts) |
| ink    | `inkjs`            | Compiler _and_ runtime in-process — no `inklecate` binary, no .NET                 |

`inkjs` is the load-bearing choice. It ships both the ink compiler and the runtime as
JavaScript, so InkCrafter compiles and plays stories entirely in-process — no
subprocess, no platform-specific compiler binary to ship, and no parsing of a CLI's
stderr to recover error positions.

## Architecture

```
src/
  main/       Electron main process — file I/O, ink compilation
    codex/    library store and entry markdown
    ink/      inkjs compiler wrapper + diagnostic parsing
    menu.ts, settings.ts, project.ts, seed.ts, workspace.ts
  preload/    contextBridge surface (the only renderer→main channel)
  renderer/   React UI
    project/  picker, file tree, project dialog
    settings/ application settings dialog
    codex/    entry list, entry dialog, library dialog
    editor/   CodeMirror integration and the ink language mode
    player/   Story runtime preview
  shared/     Types crossing the IPC boundary, plus the pure logic both
              sides need — mention detection and id generation
```

**The sidebar and the right panel are resizable.** Drag the divider, or focus it
and use the arrow keys — Shift for finer steps, Home or a double-click to return
to the default. Widths are remembered per machine in `localStorage`: this is
window furniture rather than part of the project or the author's configuration,
and losing it costs one drag. Every access to storage is guarded, because a
renderer loaded from `file://` is not guaranteed a usable storage area and a
layout preference should never stop the app opening.

**One view for the game's data.** Media, stats, vars and items, the cast and the map
were four dialogs, two of them reachable only from the app menu. They are the
**Game** view now, with a section tab strip: they are edited in the same sitting,
and three of the four already hold a name that points into another, so moving
between them should cost nothing. Each section keeps its own tab row beneath,
because _which catalogue_ and _which view of it_ are different questions.
Whatever a section's old header held — rescan, the inventory name, Add someone —
travels with its own row, since those act on the section rather than on the
window.

**The right panel is a dock, and the assistant is in it.** Every view's strip
opens with **Assistant**, so choosing it once keeps it chosen everywhere — you
can be asking it something while reading the manuscript, then switch to the
catalogues and still be in the same conversation. It is told what you are
looking at, too: the open ink file and what is selected in it, the section you
are reading, which catalogue is showing. "Add a choice here" is a sentence that
only means something because of that.

The rest of a view's strip is what that view is for: Preview and Write beside
the editor, Reading and Write beside the manuscript, Structure beside the plan.
A tab the next view does not have falls back to that view's own — Preview
becomes Reading on the way to the manuscript — but the assistant is in every
list, so it never gets left behind.

**The dock replaced a rule.** _Panes belong to one view; dialogs belong to the
window_ was earned — a control that opens a pane is silently dead in the other
views, and that shipped three times. It answered the problem by making
everything reachable a dialog, and the cost turned out to be the assistant: the
most capable thing in the app was a modal covering whatever it had been asked
about, and the Game Manager had no right-hand column beside it at all.

The dock serves the same purpose the other way round. A tab in every view's
strip cannot be dead in any of them, so the assistant is a tab and the Game
Manager is a view. What stays a dialog is configuration and one-off actions —
application settings, project settings, codex libraries, the entry editor,
exporting a bundle — because a settings screen you must navigate away from your
work to reach is worse than one that floats over it.

The selected codex entry moved to the sidebar at the same time. The codex
already owns that column; a second home on the right was what left the dock no
room for the tab that belongs in every view.

Three further boundaries:

**Compilation happens in the main process.** It needs the filesystem to resolve
`INCLUDE` statements, and the renderer deliberately has none. The renderer sends
source text and gets back story JSON plus diagnostics.

**The renderer is treated as untrusted.** `contextIsolation` on, `nodeIntegration`
off, `sandbox` on, and a build-time CSP with `connect-src 'none'`. It renders story
text and — once AI features land — model output, so it should not be able to reach
the network or the disk directly. API keys and outbound calls belong in the main
process. Every path it supplies — entry files, new story files — is validated
segment by segment and confirmed to stay inside its directory before a write.

**The stores do not depend on Electron.** `project.ts` and `codex/library.ts`
take the directory they operate on as an argument rather than reaching for the
app's paths, which keeps the data layer runnable and inspectable on its own.

## Tests

`npm run test`. The suite runs in Node by default, since most of the logic worth
testing is main-process and pure. A renderer test opts into a DOM with
`// @vitest-environment jsdom` at the top of the file, which keeps the rest fast.

Components talk to the main process for everything, so
[src/test/harness.ts](src/test/harness.ts) stands in for that side: a stubbed
`window.inkcrafter` plus fixtures for manuscripts, junctions and providers. The
stub is deliberately shallow — these tests are about what a component does with
what it gets back.

The renderer went untested for longer than it should have, and the first bug to
reach a user was there: a stale section index rendered against an emptied
manuscript, which took the whole view down. That case is now the first test in
[WritePanel.test.tsx](src/renderer/src/manuscript/WritePanel.test.tsx), and
writing the rest of the file immediately turned up a second one — clearing the
draft box to retype removed the buttons for applying it.

Where a feature reads real files, the tests get checked against real files.
Running the plan's knot resolution over `data/projects/the-lighthouse` is what
showed all fifteen scenes resolving to nothing, because a fixture built by hand
had quietly assumed each scene owned its ink. Fixtures agree with whatever you
imagined; the seeded project does not.

## Roadmap

The intended differentiator is AI that operates on the _structure_ of the story, not
on raw text ranges. The groundwork for that is already in place: every edit is
compiled, and the compiler is the arbiter of whether a change is valid.

- [ ] Parsed story model — knots, stitches, choices, diverts — surfaced to the UI
- [ ] Node-graph view of story flow (React Flow)
- [ ] Streaming drafts, so a long one is readable as it arrives
- [ ] Assistant edits shown as a diff before they land, and an undo for a turn —
      it can replace a file today, and `data/` has no history to fall back on
- [ ] Compile what the assistant wrote before it reports success, so a project it
      builds is known to run rather than merely known to exist
- [ ] AI-authored choices and branch splitting — deliberately excluded for now,
      since a model inventing structure reshapes the story silently
- [ ] Build model context from the codex — `always` entries, plus `detected`
      entries whose names appear in the scene, plus anything they relate to
- [ ] AI edits proposed as diffs, gated on a successful recompile before they can be
      accepted — a suggestion that does not compile is never offered
- [ ] Per-project overrides of a shared entry, so a story can say something
      about a character without changing it everywhere
- [ ] Preserve playback position across recompiles where the story structure is unchanged
- [ ] Visual novel layer: character sprites, backgrounds and audio bound to ink tags

## License

MIT
