// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

/**
 * The tag vocabulary, defined once for the editor and the player.
 *
 * ink hands tags back through `story.currentTags` as opaque strings, one set
 * per line, so this grammar is the entire join between a story and everything
 * that is not words: which picture is up, who is speaking, what a choice did to
 * the player's stats, whether the map is reachable from here.
 *
 * It is a superset of two vocabularies that grew separately — the editor knew
 * `char:`/`bg:` with named variants, the player knew nine flat commands — and
 * it is deliberately compatible with both. `# bg: courtyard` still means "the
 * courtyard background, first look", which is what it always meant.
 *
 * Deliberately tolerant in one direction and strict in the other. An unknown
 * key is *not ours* and is left alone, because ink already carries tags for
 * other purposes and interpolates them before we see them — a seeded project
 * writes `#trust:{archivist_trust}`, which arrives as `trust:-2`. But a key we
 * do own with a value we cannot read is dropped rather than guessed at.
 */

export type TagOp = "+" | "-" | "=";

/**
 * Where a character stands: three named places, deliberately not coordinates.
 *
 * A story says `at left` and means "the left of whatever the stage turns out to
 * be" — the pixels are the player's business, and a tag that carried them would
 * be wrong the first time a game shipped at another size.
 */
export type StageSlot = "left" | "middle" | "right";

/** In stage order, which is also the order a picker should offer them in. */
export const STAGE_SLOTS: readonly StageSlot[] = ["left", "middle", "right"];

/** Where somebody walks on when the tag says nothing about it. */
export const DEFAULT_SLOT: StageSlot = "middle";

export function isStageSlot(value: string): value is StageSlot {
  return (STAGE_SLOTS as readonly string[]).includes(value);
}

/**
 * Which character the presentation leans on, usually the one talking.
 *
 * `speaker` is the default and needs no tag at all, so `# active:` appears only
 * on a line that wants something else. Like every other tag here it sticks until
 * changed — an empty tag set means "unchanged" — so `auto` is how a line hands
 * the choice back rather than holding it forever.
 */
export type ActiveRule =
  | { rule: "speaker" }
  | { rule: "nobody" }
  | { rule: "character"; name: string };

export type TagCommand =
  /**
   * `name: null` clears the background — `# bg: none`.
   *
   * Video backgrounds loop unless the tag ends in `once`, in which case they
   * play through and hold their final frame. The flag is harmless on a still.
   *
   * `flipped` mirrors the art left to right, the same word and the same meaning
   * it has on a character or an animation — a corridor drawn receding to the
   * right is a second corridor for free. Unlike a character's flip it is a
   * setting rather than a per-line statement, because a background is: it holds
   * until another `# bg:` says otherwise, so re-showing the same background
   * without the word turns it back the way it is drawn.
   */
  | {
      kind: "bg";
      name: string | null;
      variant: string | null;
      once?: boolean;
      flipped?: boolean;
    }
  /**
   * `slot: null` is a tag that said nothing about where, which is not "middle".
   *
   * `flipped` is not the same shape, and the difference is deliberate. Where a
   * character stands carries over from the last tag that said — she stays on
   * the left through every line that does not move her. Which way she faces is
   * stated by each `# show:` outright: the tag that does not say `flipped`
   * means facing the way the art is drawn, not "unchanged". So there is no word
   * for turning it off, because nothing is holding it on.
   */
  | {
      kind: "show";
      name: string;
      variant: string | null;
      slot: StageSlot | null;
      flipped: boolean;
    }
  | { kind: "hide"; name: string }
  /**
   * The stage emptied — background removed, everyone off, every animation stopped.
   *
   * Written `# clear`, or `# char: none`. It takes the animations with it
   * because it is what an author writes at a scene change. Music is separate
   * from the visible stage and continues until explicitly stopped.
   */
  | { kind: "clear" }
  /**
   * A looping thing shown over the whole scene, behind a pale cover.
   *
   * No slot, deliberately. It began as a fourth thing standing beside the cast
   * and that turned out to be wrong in practice: an effect is rarely a person's
   * width and rarely wants a third of the frame. It fills what it can instead,
   * which leaves nothing for `at left` to mean.
   *
   * `flipped` stays, because it is about the artwork rather than the position —
   * a directional effect drawn one way round is still worth turning.
   *
   * `name: null` is `# anim: none`, which takes them all down without touching
   * who is on stage.
   */
  | { kind: "anim"; name: string | null; variant: string | null; flipped: boolean }
  /**
   * The track under the scene. `name: null` is `# music: stop`.
   *
   * A setting rather than an event: it holds across every line and every knot
   * until something says otherwise, the way a background does. That is why
   * stopping needs saying out loud — silence is not what a scene falls back to.
   *
   * Sound effects are deliberately separate: `# sound:` is a one-shot event,
   * while music is the persistent bed beneath the scene.
   *
   * `fade` is the seconds a stop takes — `# music: stop 5`. Absent and zero are
   * the same thing and are the older behaviour: the track cuts. It belongs to
   * the stop rather than to the track because it describes how this line ends
   * the music, not anything about the music itself; a later `# music:` naming a
   * track carries no fade and says nothing about one.
   */
  | {
      kind: "music";
      name: string | null;
      variant: string | null;
      fade?: number;
      loop?: boolean;
    }
  /** `name: ""` clears the speaker. */
  | { kind: "speaker"; name: string }
  | { kind: "stat"; stat: string; op: TagOp; value: number }
  | { kind: "npc"; id: string; attr: string; op: TagOp; value: string }
  | { kind: "map"; enabled: boolean }
  /** Suspend narrative advancement and run one catalogued minigame. */
  | { kind: "minigame"; name: string }
  /** Write a rotating autosave once the next stable frame is on screen. */
  | { kind: "autosave" }
  | { kind: "active"; active: ActiveRule };

/** The two that move something the story tracks, as opposed to something shown. */
export type StateCommand = Extract<TagCommand, { kind: "stat" | "npc" }>;

/**
 * Where a character ends up, given where they already were.
 *
 * Written once here because three separate things implement it — the player's
 * media layer, the player's saved frame, and the editor's preview model — and
 * three copies of a rule is three chances for them to disagree about what
 * `# char: wren/happy` does to somebody standing on the left.
 */
export function slotFor(
  current: StageSlot | undefined,
  asked: StageSlot | null
): StageSlot {
  return asked ?? current ?? DEFAULT_SLOT;
}

/** Every key this grammar answers to, aliases included. */
export const TAG_KEYS = [
  "bg",
  "background",
  "char",
  "show",
  "anim",
  "animation",
  "hide",
  "clear",
  "music",
  "speaker",
  "who",
  "stat",
  "npc",
  "map",
  "minigame",
  "autosave",
  "active",
] as const;

/** An ink identifier: what a catalogued name and a variant must both look like. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `courage +1`, `courage-2`, `faith = 5`. Integers only; ink owns arithmetic. */
const STAT = /^([A-Za-z_][A-Za-z0-9_]*)\s*([+\-=])\s*(-?\d+)$/;

/** `abeline affection +2`, `abeline status = married`. The value stays a string. */
const NPC = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*([+\-=])\s*(.+)$/;

/** The name a tag uses to mean "nothing here now". */
const NONE = "none";

/** The word `# active:` uses to hand the choice back to the speaker. */
const AUTO = "auto";

/**
 * What `# music:` says to fall silent.
 *
 * `stop` rather than `none` because it is an act rather than a setting: a
 * background tag with no picture leaves the frame empty, and music with no
 * track has to actually stop something that is already sounding.
 */
const STOP = "stop";

/**
 * `stop`, or `stop 5` for five seconds of fading.
 *
 * Fractions allowed, unlike `# stat:` where integers are the whole point: this
 * is a duration rather than a number the story counts with, and a second and a
 * half is an ordinary thing to want. A bare `stop` and `stop 0` are one case.
 */
const STOP_FADE = /^stop(?:[ 	]+(\d+(?:\.\d+)?))?$/i;

/** ` at left`, on the end of a show tag's value. */
const AT = /\s+at\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i;

/**
 * Mirrored left to right, for a sprite drawn facing the wrong way.
 *
 * Last, after `at left`, so that the two read in the order they are thought of
 * — where she stands, then which way she faces — and so that neither regex has
 * to know about the other beyond this one strip.
 */
const FLIPPED = /\s+flipped\s*$/i;

/** A video background that plays through once and holds on its final frame. */
const ONCE = /\s+once\s*$/i;

/**
 * `# music: theme loop` — the track repeats until something else replaces it.
 *
 * Opt-in, because most audio in a scene is a cue: a door, a chime, one bar of
 * something under a line. Looping used to be the only behaviour, which is why
 * the same catalogue needed a second kind for one-shots; it does not now.
 */
const LOOP = /\s+loop\s*$/i;

interface NameRef {
  name: string;
  variant: string | null;
}

interface ShowRef extends NameRef {
  slot: StageSlot | null;
  flipped: boolean;
}

/** The text of a tag as ink hands it over: no `#`, no surrounding space. */
export function bareTag(raw: string): string {
  return raw.trim().replace(/^#/, "").trim();
}

/** The key a bare tag is addressed to, lower-cased. */
export function tagKeyOf(bare: string): string {
  const colon = bare.indexOf(":");
  return (colon === -1 ? bare : bare.slice(0, colon)).trim().toLowerCase();
}

/**
 * `wren`, or `wren/happy`.
 *
 * A named variant that is malformed fails the whole tag rather than falling
 * back to the bare name — silently showing the wrong expression is worse than
 * showing none, and a tag that resolves to nothing is visible in the preview.
 */
function parseName(value: string): NameRef | null {
  const slash = value.indexOf("/");
  const name = (slash === -1 ? value : value.slice(0, slash)).trim();
  const variant = slash === -1 ? null : value.slice(slash + 1).trim();

  if (!NAME.test(name)) return null;
  if (variant !== null && !NAME.test(variant)) return null;

  return { name, variant };
}

/**
 * `wren`, `wren/happy`, or `wren/happy at left`.
 *
 * The clause is read off the *end* first, because neither a name nor a variant
 * may contain a space — so the only whitespace a well-formed value can hold is
 * the one `at` introduces, and finding it cannot corrupt the name in front of it.
 *
 * A slot that is not one of the three fails the whole tag, for the same reason a
 * misspelt variant does: standing somebody in the middle because the author
 * wrote `at lft` is a wrong answer wearing the shape of a right one.
 */
function parseShow(value: string): ShowRef | null {
  const flipped = FLIPPED.test(value);
  const rest = flipped ? value.replace(FLIPPED, "") : value;

  const match = AT.exec(rest);
  if (!match) {
    const ref = parseName(rest);
    return ref ? { ...ref, slot: null, flipped } : null;
  }

  const slot = match[1]!.toLowerCase();
  if (!isStageSlot(slot)) return null;

  const ref = parseName(rest.slice(0, match.index));
  return ref ? { ...ref, slot, flipped } : null;
}

/**
 * `courtyard`, `courtyard/dusk`, and the two words that may trail either.
 *
 * Both orders read, because neither word qualifies the other — one is about the
 * clip and one about the artwork, so `once flipped` and `flipped once` say the
 * same thing and refusing one of them would be arbitrary. Each is taken at most
 * once: a second `once` is left on the subject, where it fails as a name, which
 * is how a typo stays visible instead of being quietly absorbed.
 */
function parseBackground(value: string): {
  subject: string;
  once: boolean;
  flipped: boolean;
} {
  let subject = value;
  let once = false;
  let flipped = false;

  for (;;) {
    if (!once && ONCE.test(subject)) {
      once = true;
      subject = subject.replace(ONCE, "");
    } else if (!flipped && FLIPPED.test(subject)) {
      flipped = true;
      subject = subject.replace(FLIPPED, "");
    } else break;
  }

  return { subject: subject.trim(), once, flipped };
}

/** Parse a single raw ink tag, already stripped of its `#`. */
export function parseTag(raw: string): TagCommand | null {
  const trimmed = bareTag(raw);
  const colon = trimmed.indexOf(":");
  const key = tagKeyOf(trimmed);
  const value = colon === -1 ? "" : trimmed.slice(colon + 1).trim();

  switch (key) {
    case "bg":
    case "background": {
      const { subject, once, flipped } = parseBackground(value);
      if (subject.toLowerCase() === NONE) {
        // Nothing to hold a final frame and nothing to mirror: an empty frame
        // has no artwork for either word to be about.
        return once || flipped
          ? null
          : { kind: "bg", name: null, variant: null, once: false, flipped: false };
      }
      const ref = parseName(subject);
      return ref ? { kind: "bg", ...ref, once, flipped } : null;
    }

    // `char` is the editor's spelling and `show` the player's. They are the
    // same command; keeping both means neither body of existing ink had to be
    // rewritten when the two vocabularies met.
    case "char":
    case "show": {
      if (value === NONE) return { kind: "clear" };
      const ref = parseShow(value);
      // `# char: none at left` asks nobody to stand somewhere, which is not a
      // thing that can be done.
      if (!ref || ref.name === NONE) return null;
      return { kind: "show", ...ref };
    }

    case "anim":
    case "animation": {
      // `none` stops every animation, the way `# char: none` empties the cast.
      // It keeps the `anim` kind rather than becoming its own command, because
      // it is about animations specifically and `clear` is about the stage.
      if (value === NONE) return { kind: "anim", name: null, variant: null, flipped: false };

      const ref = parseShow(value);
      // An animation fills the frame, so `at left` names nothing it could do.
      // Refused rather than ignored: a word that quietly does nothing is a word
      // an author goes on writing. `preflight` reports it on the way out.
      if (!ref || ref.name === NONE || ref.slot !== null) return null;
      return { kind: "anim", name: ref.name, variant: ref.variant, flipped: ref.flipped };
    }

    case "hide": {
      const ref = parseName(value);
      return ref ? { kind: "hide", name: ref.name } : null;
    }

    case "clear":
      return { kind: "clear" };

    case "music": {
      const stopping = STOP_FADE.exec(value);
      if (stopping) {
        const fade = stopping[1] === undefined ? 0 : Number(stopping[1]);
        // Left off when it is zero rather than written as zero: absent and zero
        // are one case, so carrying the field would be saying nothing twice.
        return fade > 0
          ? { kind: "music", name: null, variant: null, fade }
          : { kind: "music", name: null, variant: null };
      }
      const loop = LOOP.test(value);
      const ref = parseName(loop ? value.replace(LOOP, "") : value);
      if (!ref) return null;
      // Written only when true: absent and false are one case, and carrying the
      // field would be saying nothing twice.
      return loop ? { kind: "music", ...ref, loop: true } : { kind: "music", ...ref };
    }

    // Free text, not an identifier: it is shown to a reader, not looked up.
    // An empty value is how a line says nobody in particular is speaking.
    case "speaker":
    case "who":
      return { kind: "speaker", name: value };

    case "stat": {
      const match = STAT.exec(value);
      if (!match) return null;
      return {
        kind: "stat",
        stat: match[1]!,
        op: match[2] as TagOp,
        value: Number(match[3]),
      };
    }

    case "npc": {
      const match = NPC.exec(value);
      if (!match) return null;
      return {
        kind: "npc",
        id: match[1]!,
        attr: match[2]!,
        op: match[3] as TagOp,
        value: match[4]!.trim(),
      };
    }

    case "map": {
      const on = value.toLowerCase();
      if (on === "on" || on === "off") return { kind: "map", enabled: on === "on" };
      return null;
    }

    case "minigame":
      return NAME.test(value) ? { kind: "minigame", name: value } : null;

    // A checkpoint is an event with no value. Refuse `autosave: anything` so
    // the grammar does not imply options the player would silently ignore.
    case "autosave":
      return colon === -1 ? { kind: "autosave" } : null;

    // Unlike a speaker, this names somebody in the catalogue rather than
    // carrying prose, so an empty value is far likelier to be a truncated
    // `{interpolation}` than an intent. `auto` is the word for the intent.
    case "active": {
      const word = value.toLowerCase();
      if (word === NONE) return { kind: "active", active: { rule: "nobody" } };
      if (word === AUTO) return { kind: "active", active: { rule: "speaker" } };
      return NAME.test(value) ? { kind: "active", active: { rule: "character", name: value } } : null;
    }

    default:
      return null;
  }
}

/** Parse every tag on a line, dropping the ones that are not ours. */
export function parseTags(raws: readonly string[] | null | undefined): TagCommand[] {
  if (!raws) return [];
  const commands: TagCommand[] = [];
  for (const raw of raws) {
    const command = parseTag(raw);
    if (command) commands.push(command);
  }
  return commands;
}

/**
 * A command as ink source, without the `#`.
 *
 * The editor composes tags from its catalogues rather than asking an author to
 * spell them, so this is the write half of the grammar. `parseTag(formatTag(x))`
 * round-trips every command.
 */
export function formatTag(command: TagCommand): string {
  const withVariant = (name: string, variant: string | null): string =>
    variant === null ? name : `${name}/${variant}`;

  switch (command.kind) {
    case "bg":
      return `bg: ${
        command.name === null
          ? NONE
          : `${withVariant(command.name, command.variant)}${command.once ? " once" : ""}${
              command.flipped ? " flipped" : ""
            }`
      }`;
    case "show":
      return `show: ${withVariant(command.name, command.variant)}${
        command.slot === null ? "" : ` at ${command.slot}`
      }${command.flipped ? " flipped" : ""}`;
    case "anim":
      return `anim: ${
        command.name === null
          ? NONE
          : `${withVariant(command.name, command.variant)}${command.flipped ? " flipped" : ""}`
      }`;
    case "hide":
      return `hide: ${command.name}`;
    case "clear":
      return "clear";
    case "music":
      if (command.name !== null) {
        return `music: ${withVariant(command.name, command.variant)}${command.loop ? " loop" : ""}`;
      }
      // Zero is the default and is written by leaving it out, so a stop that
      // was never given a fade round-trips as the plain word it arrived as.
      return `music: ${STOP}${command.fade ? ` ${command.fade}` : ""}`;
    case "speaker":
      return `speaker: ${command.name}`;
    // `+1` reads as one thing and `= married` as two, which is how each is
    // written by hand. Both parse either way; this is only about the ink an
    // author has to read afterwards.
    case "stat":
      return `stat: ${command.stat} ${spaced(command.op)}${command.value}`;
    case "npc":
      return `npc: ${command.id} ${command.attr} ${spaced(command.op)}${command.value}`;
    case "map":
      return `map: ${command.enabled ? "on" : "off"}`;
    case "minigame":
      return `minigame: ${command.name}`;
    case "autosave":
      return "autosave";
    case "active":
      switch (command.active.rule) {
        case "speaker":
          return `active: ${AUTO}`;
        case "nobody":
          return `active: ${NONE}`;
        case "character":
          return `active: ${command.active.name}`;
      }
  }
}

const spaced = (op: TagOp): string => (op === "=" ? "= " : op);

/** Whether a tag is addressed to us at all, however badly it is written. */
export function isKnownTag(raw: string): boolean {
  return (TAG_KEYS as readonly string[]).includes(tagKeyOf(bareTag(raw)));
}

/**
 * The media a command names, or null when it names none.
 *
 * Exhaustive rather than defaulted: a `default` here would silently swallow a
 * command added later, and the failure — a picture nothing knows to load —
 * would surface as a blank stage rather than a compile error.
 */
export function mediaRefOf(
  command: TagCommand
): {
  kind: "background" | "character" | "animation" | "music";
  name: string;
  variant: string | null;
} | null {
  switch (command.kind) {
    case "bg":
      return command.name === null
        ? null
        : { kind: "background", name: command.name, variant: command.variant };
    case "show":
      return { kind: "character", name: command.name, variant: command.variant };
    case "anim":
      // Stopping them all names no file, the same as stopping the music.
      return command.name === null
        ? null
        : { kind: "animation", name: command.name, variant: command.variant };
    case "music":
      // Stopping names no track, so there is nothing to load for it either.
      return command.name === null
        ? null
        : { kind: "music", name: command.name, variant: command.variant };
    // `hide` and `active` both name a character but ask for no file, so there is
    // nothing to load for either.
    case "hide":
    case "active":
    case "clear":
    case "speaker":
    case "stat":
    case "npc":
    case "map":
    case "minigame":
    case "autosave":
      return null;
  }
}
