import { describe, expect, it } from 'vitest'
import {
  DIALOGUE_DEFAULTS,
  emptyGame,
  parseGame,
  serialiseGame,
  splitDialogueLine
} from './gameDoc'

describe('game document', () => {
  it('defaults old projects to no visible release version', () => {
    expect(parseGame('{}')).toEqual(emptyGame())
    expect(parseGame('{"version":1,"title":{}}').releaseVersion).toBe('')
  })

  it('requires adult confirmation by default and only disables it explicitly', () => {
    expect(parseGame('{}').requireAdultConfirmation).toBe(true)
    expect(parseGame('{"requireAdultConfirmation":false}').requireAdultConfirmation).toBe(false)
    expect(parseGame('{"requireAdultConfirmation":"false"}').requireAdultConfirmation).toBe(true)
  })

  it('round-trips selected and uploaded desktop icons without accepting unsafe files', () => {
    const selected = {
      ...emptyGame(),
      desktopIcon: {
        kind: 'media' as const,
        ref: { assetId: 'med_background', variantId: 'med_day' }
      }
    }
    expect(parseGame(serialiseGame(selected))).toEqual(selected)

    expect(parseGame('{"desktopIcon":{"kind":"file","file":"icons/game.png"}}').desktopIcon)
      .toEqual({ kind: 'file', file: 'icons/game.png' })
    expect(parseGame('{"desktopIcon":{"kind":"file","file":"../game.png"}}').desktopIcon)
      .toBeNull()
  })

  it('round-trips and normalises the player-facing release version', () => {
    const game = { ...emptyGame(), releaseVersion: 'v2.4.1 beta' }
    expect(parseGame(serialiseGame(game))).toEqual(game)
    expect(parseGame(JSON.stringify({ releaseVersion: '  2026.09  ' })).releaseVersion).toBe('2026.09')
    expect(parseGame(JSON.stringify({ releaseVersion: 'x'.repeat(80) })).releaseVersion).toHaveLength(32)
  })

  it('defaults old projects to the existing dialogue typography', () => {
    expect(parseGame('{}').dialogue).toEqual(DIALOGUE_DEFAULTS)
  })

  it('round-trips dialogue typography and normalises hand-edited values', () => {
    const game = {
      ...emptyGame(),
      dialogue: {
        separateNames: true,
        text: { font: 'serif' as const, file: null, size: 31 },
        name: { font: 'custom' as const, file: 'fonts/jack.woff2', size: 44 }
      }
    }
    expect(parseGame(serialiseGame(game))).toEqual(game)

    expect(
      parseGame(JSON.stringify({
        dialogue: {
          separateNames: 'yes',
          text: { font: 'missing', file: '../outside.ttf', size: 2 },
          name: { font: 'mono', file: 'fonts/kept-for-later.otf', size: 900 }
        }
      })).dialogue
    ).toEqual({
      separateNames: false,
      text: { font: DIALOGUE_DEFAULTS.text.font, file: null, size: 12 },
      name: { font: 'mono', file: 'fonts/kept-for-later.otf', size: 64 }
    })
  })

  it('falls back when a custom font has no safe bundled file', () => {
    expect(parseGame('{"dialogue":{"text":{"font":"custom","file":"../font.ttf"}}}').dialogue.text)
      .toEqual(DIALOGUE_DEFAULTS.text)
  })

  it('maps the old OS-specific choices to a cross-platform family', () => {
    expect(parseGame('{"dialogue":{"name":{"font":"impact","size":40}}}').dialogue.name)
      .toEqual({ font: 'sans', file: null, size: 40 })
  })

  it('optionally separates an embedded speaker from the dialogue', () => {
    expect(splitDialogueLine('', 'Jack: Damn, that sounds bad.', true)).toEqual({
      speaker: 'Jack',
      text: 'Damn, that sounds bad.'
    })
    expect(splitDialogueLine('Mary', 'Jack: Hello.', true)).toEqual({
      speaker: 'Jack',
      text: 'Hello.'
    })
    expect(splitDialogueLine('', 'Jack: Hello.', false)).toEqual({
      speaker: '',
      text: 'Jack: Hello.'
    })
  })

  it('removes straight or curly quotes wrapped around a complete dialogue body', () => {
    expect(splitDialogueLine('', 'Kael: "That\'s amazing"', true)).toEqual({
      speaker: 'Kael',
      text: "That's amazing"
    })
    expect(splitDialogueLine('', 'Kael: “That\'s amazing”', true)).toEqual({
      speaker: 'Kael',
      text: "That's amazing"
    })
    expect(splitDialogueLine('', "Kael: That's amazing", true)).toEqual({
      speaker: 'Kael',
      text: "That's amazing"
    })
  })

  it('removes dialogue quotes when names stay inline or come from a speaker tag', () => {
    expect(splitDialogueLine('', 'Kael: "That\'s amazing"', false)).toEqual({
      speaker: '',
      text: "Kael: That's amazing"
    })
    expect(splitDialogueLine('Kael', '“That\'s amazing”', true)).toEqual({
      speaker: 'Kael',
      text: "That's amazing"
    })
  })

  it('keeps quotation marks in narration and incomplete dialogue quotes', () => {
    expect(splitDialogueLine('', 'The sign read “Keep out.”', true)).toEqual({
      speaker: '',
      text: 'The sign read “Keep out.”'
    })
    expect(splitDialogueLine('', 'Kael: "That\'s amazing', true)).toEqual({
      speaker: 'Kael',
      text: '"That\'s amazing'
    })
  })

  it('does not treat ordinary prose with punctuation before a colon as a name', () => {
    expect(splitDialogueLine('Narrator', 'She said, quietly: run.', true)).toEqual({
      speaker: 'Narrator',
      text: 'She said, quietly: run.'
    })
  })
})
