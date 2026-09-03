import assistant from './prompts/assistant.md?raw'
import type { ChatContext } from '@shared/chat'
import { INK_KEYWORDS, INK_UNSAFE_ANYWHERE } from '@shared/inkProse'

/**
 * The formats, as the assistant is shown them.
 *
 * Exported rather than inlined so the tests can put each one through the app's
 * own reader. A format described wrongly here does not fail loudly — the file
 * parses, a field is quietly missing, and a project ends up with no title.
 */
export const PROJECT_MANIFEST_EXAMPLE = `---
id: prj_2n8v5h1t6w
title: The Lighthouse
libraries:
  - lib_9c4k2m7q3x
main: ink/main.ink
---

The ferry stopped coming. Three people and one light.
`

export const PLAN_EXAMPLE = `{
  "version": 1,
  "notes": "",
  "globals": ["ink/overworld.ink"],
  "nodes": [
    {
      "id": "pln_0000000001",
      "title": "Act One",
      "summary": "The situation, and what disturbs it.",
      "status": "planned",
      "tags": [],
      "knot": null,
      "files": [],
      "children": [
        {
          "id": "pln_0000000002", "title": "Chapter One", "summary": "The arrival.",
          "status": "planned", "tags": [], "knot": null, "files": [],
          "children": [
            {
              "id": "pln_0000000003", "title": "At the gate", "summary": "She arrives.",
              "status": "planned", "tags": [], "knot": null,
              "files": ["ink/scenes/at-the-gate.ink"], "children": []
            }
          ]
        }
      ]
    }
  ]
}`

export const CAST_EXAMPLE = `{
  "version": 1,
  "npcs": [
    {
      "id": "stt_0000000003", "inkId": "maren", "name": "Maren", "sprite": "maren",
      "variables": [
        { "key": "trust", "label": "Trust", "kind": "number",
          "initial": 2, "min": 0, "max": 10, "values": [] },
        { "key": "standing", "label": "Standing", "kind": "text",
          "initial": "stranger", "min": 0, "max": 10,
          "values": ["stranger", "ally", "sworn"] },
        { "key": "knows", "label": "Knows", "kind": "boolean",
          "initial": false, "min": 0, "max": 10, "values": [] }
      ]
    }
  ]
}`

export const MEDIA_EXAMPLE = `{
  "version": 1,
  "assets": [
    {
      "id": "med_0000000001", "kind": "character", "name": "maren",
      "display": "Maren", "description": "", "tags": ["cast"],
      "variants": [
        { "id": "med_0000000002", "name": "happy", "file": "characters/maren/happy.png" },
        { "id": "med_0000000003", "name": "", "file": "characters/maren/neutral.png" }
      ]
    },
    {
      "id": "med_0000000004", "kind": "music", "name": "door_slam",
      "display": "Door slam", "description": "", "tags": ["door"],
      "variants": [
        { "id": "med_0000000005", "name": "heavy", "file": "music/door_slam/heavy.ogg" }
      ]
    }
  ]
}`

export const MAP_EXAMPLE = `{
  "version": 2,
  "maps": [
    {
      "id": "map_0000000001", "name": "harbour", "display": "The Harbour",
      "image": "harbour", "size": { "width": 1280, "height": 720 },
      "knots": ["the_docks"],
      "locations": [
        {
          "id": "loc_0000000004", "label": "The Archive",
          "destination": { "to": "knot", "name": "the_archive" },
          "x": 420, "y": 300, "width": 230, "height": 64,
          "available": { "op": "compare",
                         "left": { "source": "npcFlag", "npc": "maren", "key": "knows" },
                         "cmp": "==", "right": true },
          "lockedHint": "Maren has not mentioned it yet."
        },
        {
          "id": "loc_0000000005", "label": "The Old Town",
          "destination": { "to": "map", "name": "old_town" },
          "x": 900, "y": 420, "width": 230, "height": 64,
          "available": null, "lockedHint": "", "art": ""
        }
      ]
    },
    {
      "id": "map_0000000002", "name": "old_town", "display": "The Old Town",
      "image": "old_town", "size": { "width": 1280, "height": 720 },
      "knots": ["the_old_town", "the_well"],
      "locations": [
        {
          "id": "loc_0000000006", "label": "Back to the harbour",
          "destination": { "to": "map", "name": "harbour" },
          "x": 120, "y": 640, "width": 230, "height": 64,
          "available": null, "lockedHint": "", "art": ""
        }
      ]
    }
  ]
}`

export const STATS_EXAMPLE = `{
  "version": 1,
  "stats": [
    {
      "id": "stt_0000000001", "name": "strength", "kind": "number", "initial": 0,
      "description": "Author note; becomes a comment in the ink.",
      "display": "Strength", "blurb": "How much they can lift.",
      "icon": "", "custom": []
    }
  ],
  "variables": [
    {
      "id": "stt_0000000004", "name": "has_met_keeper", "kind": "boolean",
      "initial": false, "min": null, "max": null,
      "description": "Hidden story state; never shown on the character screen."
    }
  ],
  "items": [
    {
      "id": "stt_0000000002", "name": "brass_key",
      "description": "",
      "display": "Brass Key", "blurb": "Cold, heavy, older than the door.",
      "icon": "icons/key.png",
      "custom": [{ "label": "slot", "value": "offhand" }]
    }
  ]
}`

export const CODEX_ENTRY_EXAMPLE = `---
id: cdx_1a2b3c4d5e
name: Mara
type: character
aliases:
  - The keeper
tags: []
aiContext: detected
tracking:
  byName: true
  caseSensitive: false
  exclusions: []
relations: []
details: []
---

Keeper of the light for eleven years.
`

export const LIBRARY_EXAMPLE = `---
id: lib_9c4k2m7q3x
title: Lighthouse world
---

The island, the light, and the people still on it.
`

export const INK_EXAMPLE = `INCLUDE chapters/arrival.ink

-> the_door

=== the_door ===
The door to the archive is shut.

* [Try the handle]
    It turns. Of course it turns.
    -> inside

* [Look for another way]
    -> inside

=== inside ===
Inside, the shelves go up further than the light does.
-> END
`

/**
 * What the assistant is told before it starts.
 *
 * The whole difficulty is that this model *writes the app's own files*. A wrong
 * guess about a frontmatter key does not fail loudly — the file loads, the field
 * is missing, and a project quietly has no title. So the formats are given
 * exactly, with a real example of each, rather than described.
 *
 * The ink rules are imported from [inkProse.ts](../../shared/inkProse.ts) rather
 * than restated, for the same reason the drafting prompt imports them: two
 * copies of a rule is one copy and one bug waiting.
 */
/**
 * Where the author is, in one paragraph.
 *
 * The assistant lives in the panel beside whatever is open, so "add a choice
 * here" is the ordinary request and it is meaningless without this. Kept short
 * and factual: it says what is on screen, not what to do about it, because the
 * moment it starts suggesting, every turn drifts towards the open file.
 */
function whereTheyAre(context: ChatContext | undefined): string {
  if (!context) return ''

  const lines: string[] = []

  if (context.view === 'editor' && context.file) {
    lines.push(`They are in the ink editor with ${context.file} open.`)
    if (context.selection) {
      lines.push(`They have this selected:\n\n${context.selection}`)
    }
  } else if (context.view === 'manuscript') {
    lines.push(
      context.section
        ? `They are reading the manuscript, at the section "${context.section}".`
        : 'They are reading the manuscript.'
    )
  } else if (context.view === 'plan') {
    lines.push('They are looking at the plan — the acts, chapters and scenes.')
  } else if (context.view === 'game') {
    lines.push(
      `They are in the Game manager, looking at ${context.catalogue ?? 'the catalogues'}.`
    )
  } else if (context.file) {
    lines.push(`They have ${context.file} open.`)
  }

  if (lines.length === 0) return ''

  return [
    '',
    '',
    'WHERE THEY ARE',
    ...lines,
    'When they say "here" or "this", they most likely mean that. Read the file before changing it, as always.'
  ].join('\n')
}

/**
 * `extra` is the author's own standing instructions, added at the end.
 *
 * Added rather than allowed to replace any of this: what follows carries the
 * tool routing table, the workspace layout and a worked example of every file
 * format, and `chatPrompt.test.ts` checks the first of those against the real
 * tool list. A prompt with the table edited out still reads like a prompt and
 * quietly cannot call anything.
 */
export function chatSystemPrompt(
  projectPath: string | null,
  context?: ChatContext,
  extra = '',
  codexBlock = ''
): string {
  const here = projectPath
    ? `The author currently has the project at ${projectPath} open. Unless they say otherwise, assume they mean that one.`
    : 'No project is open at the moment.'

  const where = codexBlock ? [here + whereTheyAre(context), codexBlock].join(NEWLINES) : here + whereTheyAre(context)

  return (
    fill(assistant, {
      context: where,
      projectExample: PROJECT_MANIFEST_EXAMPLE,
      planExample: PLAN_EXAMPLE,
      statsExample: STATS_EXAMPLE,
      castExample: CAST_EXAMPLE,
      mediaExample: MEDIA_EXAMPLE,
      mapExample: MAP_EXAMPLE,
      codexExample: CODEX_ENTRY_EXAMPLE,
      libraryExample: LIBRARY_EXAMPLE,
      inkExample: INK_EXAMPLE,
      inkUnsafe: INK_UNSAFE_ANYWHERE.join(' '),
      inkKeywords: INK_KEYWORDS.join(' ')
    }).trimEnd() + authorSays(extra)
  )
}

/** The blank line between the project header and a codex block. */
const NEWLINES = String.fromCharCode(10, 10)

/**
 * The markdown with its generated halves spliced in.
 *
 * Split and joined rather than matched: a placeholder is a literal string, and
 * a regular expression here would be one more thing to escape in a file that is
 * mostly prose about escaping.
 */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(value),
    template
  )
}

/** The author's own instructions, marked as theirs so they read as an order. */
function authorSays(extra: string): string {
  const said = extra.trim()
  return said.length > 0 ? `\n\nFROM THE AUTHOR\n${said}` : ''
}
