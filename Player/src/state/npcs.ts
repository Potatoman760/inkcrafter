/**
 * The cast.
 *
 * There is no list of NPCs here any more. Who exists, what is tracked about
 * them and what the allowed values are all come from the bundle's `npcs.json`,
 * authored in InkCrafter — which is also the only thing that declares the ink
 * variables behind them. Two things declaring the same `VAR` is a compile error,
 * so there can only be one, and it has to be the side that compiles.
 *
 * What is left is the shape, re-exported so the rest of the player can go on
 * importing `@/state/npcs` without knowing where it comes from.
 */

export {
  npcVar,
  npcAttrNames,
  npcVarNames,
  findNpc,
  spriteForSpeaker,
  attrKind,
  npcVariable,
  emptyNpcs,
  parseNpcs,
  type Npc,
  type NpcVariable,
  type NpcVarKind,
  type NpcDocument,
} from "@/bundle/spec/bundle/npcDoc";
