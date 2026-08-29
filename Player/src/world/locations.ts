import { evaluate, type ConditionHost } from "@/bundle/spec/bundle/condition";
import type { MapLocation } from "@/bundle/spec/bundle/mapDoc";
import type { GameState } from "@/state/GameState";

export type { MapLocation };
export { describe as describeCondition } from "@/bundle/spec/bundle/condition";

/**
 * Whether a place can be travelled to.
 *
 * There is no list of places here any more, and no predicates. Both come from
 * the bundle's `map.json`, authored in InkCrafter — a gate used to be a
 * TypeScript closure, which is a fine thing to write and an impossible thing to
 * export, so it is data now and this is the evaluator's adapter.
 *
 * Everything the evaluator can ask reduces to something the game already knows:
 * a visit count, a stat, or one of an NPC's attributes.
 */
export function hostFor(state: GameState): ConditionHost {
  return {
    visits: (path) => state.engine.visitCount(path),
    stat: (key) => state.stats.get(key),
    npcStat: (npc, key) => state.npcs.getStat(npc, key),
    npcStatus: (npc, key) => state.npcs.getStatus(npc, key),
    npcFlag: (npc, key) => state.npcs.getFlag(npc, key),
  };
}

export function isLocationAvailable(location: MapLocation, host: ConditionHost): boolean {
  return evaluate(location.available, host);
}
