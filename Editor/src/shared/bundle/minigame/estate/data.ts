import { newId } from '../../../ids'
import { minigameName, tuned, record, text, mediaRef, parseTunable } from '../common'
import { ESTATE_ROOMS, estateConfiguration, estatePlanSize, type EstateMinigame } from './estate'
export type { EstateMinigame } from './estate'


export function newEstateMinigame(name: string): EstateMinigame {
  return {
    id: newId('mng'), kind: 'estate', name: minigameName(name), display: name.trim(),
    description: '', background: null, resultVariable: '', stateVariable: '', showStateHints: false,
    startingFunds: tuned(80), dailyStipend: tuned(18), commissionBonus: tuned(0),
    floorPlanSize: estatePlanSize(null), rooms: ESTATE_ROOMS.map(room => ({ ...room, requires: null, bounds: room.bounds && { ...room.bounds } })), residents: []
  }
}

export function parseEstate(value: unknown): EstateMinigame | null {
  const one = record(value)
  if (!one || one['kind'] !== 'estate' || !minigameName(text(one['name']))) return null
  return {
    id: text(one['id']) || newId('mng'), kind: 'estate', name: minigameName(text(one['name'])),
    display: text(one['display']) || text(one['name']), description: text(one['description']),
    background: mediaRef(one['background']), resultVariable: text(one['resultVariable']),
    stateVariable: text(one['stateVariable']), showStateHints: one['showStateHints'] === true,
    ...(one['noticeboardBackground'] === undefined ? {} : { noticeboardBackground: mediaRef(one['noticeboardBackground']) }),
    ...(one['disabledFloorPlan'] === undefined ? {} : { disabledFloorPlan: mediaRef(one['disabledFloorPlan']) }),
    startingFunds: parseTunable(one['startingFunds'], 80), dailyStipend: parseTunable(one['dailyStipend'], 18),
    commissionBonus: parseTunable(one['commissionBonus'], 0), floorPlanSize: estatePlanSize(one['floorPlanSize']), ...estateConfiguration(one)
  }
}

export default { kind: 'estate', create: newEstateMinigame, parse: parseEstate } as const
