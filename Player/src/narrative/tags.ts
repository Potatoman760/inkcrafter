/**
 * Ink tag parsing.
 *
 * The grammar itself is not defined here — it is the contract with InkCrafter,
 * which has to write the same tags this reads, so it lives in the vendored spec
 * (`src/bundle/spec/bundle/tagSpec.ts`) and is shared verbatim by both. This
 * module exists so the rest of the player can go on importing `@/narrative/tags`
 * without knowing that.
 *
 * Ink lines carry hashtag metadata:
 *
 *   The gate groans open. # bg: courtyard # show: abeline/happy
 *   ~ nothing                              # play: vision
 *
 * `Story.currentTags` returns those without the leading `#`. Unknown tags are
 * ignored, so an author can annotate freely.
 */

export {
  parseTag,
  parseTags,
  formatTag,
  isKnownTag,
  mediaRefOf,
  slotFor,
  isStageSlot,
  STAGE_SLOTS,
  DEFAULT_SLOT,
  type TagCommand,
  type TagOp,
  type StageSlot,
  type ActiveRule,
} from "@/bundle/spec/bundle/tagSpec";
