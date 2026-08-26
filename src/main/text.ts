/**
 * Removes a leading UTF-8 byte order mark.
 *
 * ink is line-structure-sensitive and only recognises constructs like `TODO:`,
 * `VAR` or `===` at the very start of a line. A BOM silently shifts the first
 * line by one character, so a file saved by Notepad or PowerShell (both of
 * which emit a BOM by default on Windows) misparses in a way that is invisible
 * in the editor. Strip it on the way in; Node writes UTF-8 without a BOM, so
 * saving does not put it back.
 */
export function stripBom(contents: string): string {
  return contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents
}
