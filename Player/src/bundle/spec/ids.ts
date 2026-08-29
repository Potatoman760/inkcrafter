// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

/**
 * Stable identifiers for the things that get linked to.
 *
 * Codex entries are shared between projects, so an entry's identity cannot be
 * its file path: renaming a file in one project would have to fix references in
 * projects that are not open and cannot be enumerated. Ids are generated once,
 * written into the file, and never change — which leaves the filename free to
 * be reorganised at will, in the app or outside it.
 */

export const ID_PREFIXES = [
  'prj',
  'lib',
  'cdx',
  'prv',
  'pln',
  'stt',
  'med',
  'ach',
  'mng',
  'map',
  'loc'
] as const
export type IdPrefix = (typeof ID_PREFIXES)[number]

/** Crockford-ish base32: no `i`, `l`, `o` or `u`, so ids cannot spell things or be misread. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const LENGTH = 10

const ID_PATTERN = new RegExp(`^(?:${ID_PREFIXES.join('|')})_[${ALPHABET}]{${LENGTH}}$`)

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(LENGTH)
  crypto.getRandomValues(bytes)

  let suffix = ''
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length]
  return `${prefix}_${suffix}`
}

/** True for a well-formed id of any kind. Used to tell ids from legacy path references. */
export function isId(value: string): boolean {
  return ID_PATTERN.test(value)
}

export function isIdOf(value: string, prefix: IdPrefix): boolean {
  return isId(value) && value.startsWith(`${prefix}_`)
}
