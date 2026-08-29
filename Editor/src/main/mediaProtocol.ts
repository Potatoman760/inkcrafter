import { pathToFileURL } from 'node:url'
import { isAbsolute, join, relative, sep } from 'node:path'
import { net, protocol } from 'electron'
import { dataDir } from './workspace'

/**
 * Serving the author's images to the renderer.
 *
 * The renderer cannot simply point an `<img>` at a file on disk. In development
 * the document is served over `http:`, and Chromium refuses a `file:`
 * subresource from a non-`file:` document whatever the CSP says. In a packaged
 * build the document *is* `file:`, but `img-src 'self'` covers the bundle, and
 * the workspace lives outside it.
 *
 * So images come through a scheme of our own. `app://media/<project>/<path>`
 * resolves under the workspace and nowhere else, which keeps the arrangement the
 * rest of the app already relies on: the renderer names a file, the main process
 * decides whether that name is allowed to become one.
 *
 * Chosen over base64 `data:` URIs, which would have needed no protocol at all:
 * those inflate by a third, hold every sprite in a JS string, and cross IPC
 * again on each render. Fine for an icon, wrong for an asset pipeline.
 */

export const MEDIA_SCHEME = 'app'

/**
 * Must run before `app.whenReady()`. Registering afterwards leaves the scheme
 * non-standard, and a non-standard scheme has an opaque origin that CSP will not
 * match — the images would be blocked with no obvious reason why.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/**
 * The workspace file a request names, or null when it names anything else.
 *
 * Exported for its own tests, because this is the containment check and it
 * should be tested as one. `..`, an absolute path, a drive letter and a UNC
 * share all have to fail, and the result is confirmed inside the root
 * regardless — the same belt-and-braces `resolveInWorkspace` uses for the
 * assistant's paths.
 */
export function resolveMediaRequest(root: string, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.host !== 'media') return null

  // decodeURIComponent, because a filename may legitimately contain a space.
  let path: string
  try {
    path = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) return null

  for (const segment of segments) {
    if (segment === '.' || segment === '..') return null
    if (segment.includes('\0') || segment.includes('\\')) return null
  }

  const resolved = join(root, ...segments)
  const inside = relative(root, resolved)
  if (inside.length === 0 || inside.startsWith('..') || isAbsolute(inside)) return null

  return resolved
}

/** Only what a story can actually show. */
const SERVED = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.svg',
  // Video, for full-screen beats. `net.fetch` streams from disk, so a clip is
  // no more of a problem here than a large background.
  '.mp4',
  '.webm',
  // Music and one-shot sound effects. Streamed the same way as a clip.
  '.mp3',
  '.ogg',
  '.wav',
  '.m4a',
  '.flac',
  '.opus'
] as const

export function isServableMedia(path: string): boolean {
  const lower = path.toLowerCase()
  return SERVED.some((extension) => lower.endsWith(extension))
}

/** Must run after `app.whenReady()`. */
export function handleMediaRequests(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const path = resolveMediaRequest(dataDir(), request.url)
    if (!path || !isServableMedia(path)) return new Response('Not found', { status: 404 })

    try {
      // net.fetch streams from disk rather than reading the whole file into
      // memory, which matters once backgrounds are a few megabytes each.
      return await net.fetch(pathToFileURL(path).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** The URL the renderer should use for a workspace-relative path. */
export function mediaUrl(workspacePath: string): string {
  const encoded = workspacePath
    .split(sep)
    .join('/')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `${MEDIA_SCHEME}://media/${encoded}`
}
