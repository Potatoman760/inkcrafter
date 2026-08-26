import { isAbsolute, join, relative, sep } from 'node:path'

/**
 * Confining the assistant to the workspace.
 *
 * Every path the model produces arrives as an arbitrary string from a remote
 * service, so this is the boundary that matters most in the feature: the model
 * may name any file it likes, and this decides whether that name is allowed to
 * become a real one.
 *
 * The check is deliberately a whitelist rather than a search for `..`. Blacklists
 * lose to encodings — `%2e%2e`, `..\`, a NUL, a Windows drive letter, a UNC
 * share, an alternate data stream — and each of those is a way out of the
 * directory. A segment that is not plainly a name is refused without trying to
 * work out what it meant.
 */

/** Letters, digits, and the punctuation a filename actually needs. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/

/** What the app knows how to read. The model has no business writing anything else. */
export const ALLOWED_EXTENSIONS = ['.ink', '.md', '.json', '.txt'] as const

export class WorkspacePathError extends Error {}

function refuse(path: string, why: string): never {
  throw new WorkspacePathError(`Refused the path ${JSON.stringify(path)}: ${why}.`)
}

/**
 * Resolves a `/`-separated workspace-relative path to an absolute one inside
 * `root`, or throws. The returned path is guaranteed to be within `root`.
 */
export function resolveInWorkspace(root: string, path: string): string {
  if (typeof path !== 'string') refuse(String(path), 'it is not a string')

  const trimmed = path.trim()
  if (trimmed.length === 0) refuse(path, 'it is empty')
  if (trimmed.includes('\0')) refuse(path, 'it contains a null byte')
  if (trimmed.includes('\\')) refuse(path, 'use / to separate folders, not a backslash')
  if (isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed)) refuse(path, 'it must be relative')

  const segments = trimmed.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) refuse(path, 'it names nothing')
  if (segments.length > 12) refuse(path, 'it is nested too deeply')

  for (const segment of segments) {
    if (segment === '.' || segment === '..') refuse(path, 'it tries to leave the workspace')
    if (!SEGMENT.test(segment)) refuse(path, `the part ${JSON.stringify(segment)} is not a plain name`)
    if (segment.length > 80) refuse(path, 'one of its names is too long')
  }

  const resolved = join(root, ...segments)

  // The belt to the whitelist's braces: whatever the platform made of those
  // segments, the result has to still be under the root.
  const inside = relative(root, resolved)
  if (inside.length === 0 || inside.startsWith('..') || isAbsolute(inside)) {
    refuse(path, 'it resolves outside the workspace')
  }

  return resolved
}

/** The workspace-relative, `/`-separated form of an absolute path inside `root`. */
export function workspaceRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/')
}

export function assertWritableExtension(path: string): void {
  const lower = path.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new WorkspacePathError(
      `Refused to write ${JSON.stringify(path)}: only ${ALLOWED_EXTENSIONS.join(', ')} files can be written.`
    )
  }
}
