import type { MinigameCheck } from '../check.editor'
import { ESTATE_CONTRACT_LIMIT, ESTATE_CREW_LARGEST, estateRoomMembers } from './estate'
import { findAsset, isVideoFile } from '../../../mediaDoc'
import { npcVar } from '../../npcDoc'
import { galleryMedia, type GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

const check: MinigameCheck = ({ game, input, variables, problems, at }) => {
  if (game.kind !== 'estate') return []
  let tunings: [string, TunableNumber][]
  const pictures: [string, GalleryMediaRef][] = game.rooms.flatMap(room => [
    ...(room.background ? [[room.name, room.background] as [string, GalleryMediaRef]] : []),
    ...(room.bathingBackground ? [[room.name + ' bathing', room.bathingBackground] as [string, GalleryMediaRef]] : []),
    ...(room.unrestoredBackground ? [[room.name + ' unrestored', room.unrestoredBackground] as [string, GalleryMediaRef]] : [])
  ])
  if (game.noticeboardBackground) pictures.push(['notice board', game.noticeboardBackground])
  if (game.disabledFloorPlan) pictures.push(['disabled floor plan', game.disabledFloorPlan])
  for (const [label, ref] of pictures) {
    const art = galleryMedia(input.media, ref)
    if (!art) problems.push(at(`${game.display || game.name}'s ${label} background is no longer in the media catalogue.`))
    else if (art.kind !== 'background' || isVideoFile(art.file)) problems.push(at(`${game.display || game.name}'s ${label} background must be a still background image.`))
  }
  const ledger = variables.find(one => one.name === game.stateVariable)
  if (!ledger || ledger.kind !== 'text' || game.stateVariable === game.resultVariable) {
    problems.push(at(`${game.display || game.name} needs a separate text ledger variable.`))
  }
  const keys = new Set(game.rooms.map(room => room.key))
  if (game.tutorial) {
    const guide = findAsset(input.media, 'character', game.tutorial.speaker.sprite)
    const look = game.tutorial.speaker.expression ?? 'neutral'
    if (!guide || !guide.variants.some(one => one.name === look && one.file && !isVideoFile(one.file))) {
      problems.push(at(`${game.display || game.name}'s tutorial guide needs a still character sprite with the ${look} look.`))
    }
    for (const step of game.tutorial.steps) {
      if (step.room && !keys.has(step.room)) problems.push(at(`${game.display || game.name}'s tutorial step ${step.title} names an unknown room.`))
    }
  }
  const declaredBoolean = (name: string): boolean =>
    variables.some(one => one.name === name && one.kind === 'boolean') ||
    input.npcs.npcs.some(npc => npc.variables.some(one => npcVar(npc.inkId, one.key) === name && one.kind === 'boolean'))
  if (!keys.has('hall') || keys.size !== game.rooms.length) {
    problems.push(at(`${game.display || game.name} needs unique room keys including hall.`))
  }
  for (const room of game.rooms) {
    if (room.availabilityVariable) {
      const declared = variables.some(one => one.name === room.availabilityVariable && one.kind === 'boolean') ||
        input.npcs.npcs.some(npc => npc.variables.some(one => npcVar(npc.inkId, one.key) === room.availabilityVariable && one.kind === 'boolean'))
      if (!declared) problems.push(at(`${game.display || game.name}'s ${room.name} needs a boolean availability variable.`))
    }
    const members = estateRoomMembers(room)
    if (room.sharedBaths && (room.beds > 0 || members.length)) problems.push(at(`${game.display || game.name}'s ${room.name} must be a non-residential shared space to host baths.`))
    if (room.beds > 2) problems.push(at(`${game.display || game.name}'s ${room.name} can house at most two residents.`))
    if (room.companionKey && (!room.residentKey || room.companionKey === room.residentKey)) {
      problems.push(at(`${game.display || game.name}'s ${room.name} needs two different intended residents.`))
    }
    if (room.inviteTogether && members.length !== 2) problems.push(at(`${game.display || game.name}'s ${room.name} needs two residents to invite together.`))
    for (const key of members) {
      if (!game.residents.some(one => one.key === key)) {
        problems.push(at(`${game.display || game.name}'s ${room.name} names an unknown resident.`))
      }
      if (room.beds < members.length) problems.push(at(`${game.display || game.name}'s ${room.name} needs capacity for its ${members.length === 1 ? 'one intended resident' : 'two intended residents'}.`))
      if (game.rooms.some(one => one.key !== room.key && estateRoomMembers(one).includes(key))) {
        problems.push(at(`${game.display || game.name} assigns more than one home to ${key}.`))
      }
    }
    const box = room.bounds
    if (box && (box.x - box.width / 2 < 0 || box.y - box.height / 2 < 0 ||
        box.x + box.width / 2 > game.floorPlanSize.width || box.y + box.height / 2 > game.floorPlanSize.height)) {
      problems.push(at(`${game.display || game.name}'s ${room.name} extends outside its floor plan.`))
    }
  }
  const resultTokens = new Set<string>()
  if (new Set(game.residents.map(one => one.key)).size !== game.residents.length) {
    problems.push(at(`${game.display || game.name} has duplicate resident keys.`))
  }
  for (const resident of game.residents) {
    const declared = variables.some(one => one.name === resident.eligibilityVariable && one.kind === 'boolean') ||
      input.npcs.npcs.some(npc => npc.variables.some(one => npcVar(npc.inkId, one.key) === resident.eligibilityVariable && one.kind === 'boolean'))
    if (!declared) problems.push(at(`${resident.name} needs a boolean invitation variable.`))
    if (resident.sprite && !findAsset(input.media, 'character', resident.sprite)) {
      problems.push(at(`${resident.name}'s villa portrait is missing.`))
    }
    if (resident.bathSprite) {
      const art = galleryMedia(input.media, resident.bathSprite)
      if (!art || art.kind !== 'character' || isVideoFile(art.file)) {
        problems.push(at(`${resident.name}'s bath sprite must reference a still character look in the media catalogue.`))
      }
    }
    for (const scene of resident.scenes) {
      if (!keys.has(scene.room)) problems.push(at(`${resident.name}'s ${scene.title} names an unknown room.`))
      if (!scene.result || scene.result === 'return' || resultTokens.has(scene.result)) {
        problems.push(at(`${resident.name}'s ${scene.title} needs a unique scene result.`))
      }
      resultTokens.add(scene.result)
      if (scene.gate && !declaredBoolean(scene.gate)) {
        problems.push(at(`${resident.name}'s ${scene.title} waits on ${scene.gate}, which is not a declared boolean.`))
      }
    }
  }
  // A calendar names variables the story owns; each has to exist with the kind the villa reads.
  if (game.calendar) {
    const who = game.display || game.name
    if (game.calendar.lastWorkday != null && game.calendar.lastDay != null && game.calendar.lastWorkday > game.calendar.lastDay) {
      problems.push(at(`${who}'s calendar last workday must not be after its last day.`))
    }
    const kindOf = (name: string): string | null => variables.find(one => one.name === name)?.kind ?? null
    if (kindOf(game.calendar.day) !== 'number') problems.push(at(`${who}'s calendar day variable must be a declared number.`))
    if (kindOf(game.calendar.settled) !== 'number') problems.push(at(`${who}'s settled-day variable must be a declared number.`))
    if (game.calendar.day === game.calendar.settled) problems.push(at(`${who}'s calendar needs two different variables for the day and the settled day.`))
    if (game.calendar.when && kindOf(game.calendar.when.variable) !== 'text') {
      problems.push(at(`${who}'s settlement phase variable must be a declared text variable.`))
    }
  }
  // Only authored notices are checked: the built-in board is known good.
  if (game.contracts) {
    const who = game.display || game.name
    if (game.contracts.length === 0 || game.contracts.length > ESTATE_CONTRACT_LIMIT) {
      problems.push(at(`${who} needs between one and ${ESTATE_CONTRACT_LIMIT} notices on its board.`))
    }
    for (const contract of game.contracts) {
      if (!contract.name.trim()) problems.push(at(`${who} has a notice with no name.`))
      if (contract.needs.every(count => count === 0)) problems.push(at(`${who}'s ${contract.name} notice needs no crew at all.`))
      if (contract.needs.some(count => count > ESTATE_CREW_LARGEST)) {
        problems.push(at(`${who}'s ${contract.name} notice needs more of a crew than the villa ever has.`))
      }
    }
  }
  tunings = [['starting funds', game.startingFunds], ['daily stipend', game.dailyStipend], ['commission bonus', game.commissionBonus]]
  return tunings
}

export default check
