import { access, readdir, rmdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Every file under `root` matching `accept`, as paths relative to it with `/`
 * separators. A missing root is an empty tree rather than an error, since that
 * is the normal state of a project that has not been written to yet.
 */
export async function walkFiles(
  root: string,
  accept: (filename: string) => boolean,
  prefix = ''
): Promise<string[]> {
  let contents
  try {
    contents = await readdir(join(root, prefix), { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const found = await Promise.all(
    contents.map(async (item) => {
      const child = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) return walkFiles(root, accept, child)
      return accept(item.name) ? [child] : []
    })
  )

  return found.flat()
}

/** Removes folders left empty by a delete or a move, up to but never including `root`. */
export async function pruneEmptyFolders(root: string, directory: string): Promise<void> {
  let current = directory
  for (;;) {
    const inside = relative(root, current)
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return
    try {
      await rmdir(current)
    } catch {
      // Not empty, or already gone. Nothing further up can be empty either.
      return
    }
    current = dirname(current)
  }
}

/**
 * Resolves a `folder/name` path inside `root`, refusing anything that could
 * escape it. These paths originate in the renderer, which is untrusted by
 * design, so each segment is checked and the result is confirmed to be inside.
 */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/

export function safePath(root: string, relativePath: string, extension: string): string {
  const segments = relativePath.split('/')
  if (segments.length === 0 || !segments.every((segment) => SAFE_SEGMENT.test(segment))) {
    throw new Error(`Unsafe path: ${relativePath}`)
  }

  const path = `${join(root, ...segments)}${extension}`
  const inside = relative(root, path)
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Path escapes its directory: ${relativePath}`)
  }

  return path
}
