import { describe, expect, it, vi } from 'vitest'
import { isAbsolute, join, sep } from 'node:path'

vi.mock('electron', () => ({ protocol: {}, net: {} }))
vi.mock('./workspace', () => ({ dataDir: () => '/w/data' }))

const { isServableMedia, mediaUrl, resolveMediaRequest } = await import('./mediaProtocol')

const ROOT = join(sep === '\\' ? 'C:\\w' : '/w', 'data')

/**
 * The renderer names a file and this decides whether that name may become one —
 * the same boundary as the assistant's `workspacePath`, and tested the same way:
 * as attacks rather than as typos.
 */
describe('resolveMediaRequest', () => {
  it('resolves an image inside the workspace', () => {
    const path = resolveMediaRequest(ROOT, 'app://media/projects/x/media/bg/cove.png')

    expect(path).toBe(join(ROOT, 'projects', 'x', 'media', 'bg', 'cove.png'))
    expect(isAbsolute(path!)).toBe(true)
  })

  it('decodes a filename with a space in it', () => {
    expect(resolveMediaRequest(ROOT, 'app://media/projects/x/media/the%20cove.png')).toBe(
      join(ROOT, 'projects', 'x', 'media', 'the cove.png')
    )
  })

  describe('refuses anything that is not a workspace file', () => {
    const attacks: [string, string][] = [
      ['app://media/projects/x%2f..%2f..%2f..%2fsecrets.png', 'an encoded climb'],
      ['app://media/', 'nothing at all'],
      ['app://media', 'no path'],
      ['app://elsewhere/projects/x/a.png', 'a different host'],
      ['file:///C:/Windows/win.ini', 'a different scheme'],
      ['https://example.com/a.png', 'a remote URL'],
      ['not a url at all', 'gibberish'],
      ['app://media/projects/x/a%00.png', 'a null byte'],
      ['app://media/projects/x\\..\\..\\secrets.png', 'backslash separators']
    ]

    for (const [url, why] of attacks) {
      it(`refuses ${why}`, () => {
        expect(resolveMediaRequest(ROOT, url)).toBeNull()
      })
    }
  })

  /**
   * A plain `..` never reaches this function. `app:` is registered as a
   * *standard* scheme, so the URL parser resolves the path and clamps it at the
   * root before we see it: `app://media/../../secrets.png` arrives as
   * `/secrets.png`. That is a safe outcome rather than a refused one, so the
   * property worth asserting is containment, not rejection.
   */
  it('clamps a climb to inside the root rather than escaping it', () => {
    for (const url of [
      'app://media/../../secrets.png',
      'app://media/projects/../../../etc/passwd.png',
      'app://media/..%2F..%2Fsecrets.png'
    ]) {
      const path = resolveMediaRequest(ROOT, url)
      if (path === null) continue

      const inside = path.startsWith(ROOT + sep)
      expect(inside, `${url} resolved to ${path}, outside the root`).toBe(true)
    }
  })

  it('never resolves outside the root, whatever it is handed', () => {
    const urls = [
      'app://media/a.png',
      'app://media/../a.png',
      'app://media/./../../a.png',
      'app://media/%2e%2e/a.png',
      'app://media/projects/x/../../../../a.png'
    ]

    for (const url of urls) {
      const path = resolveMediaRequest(ROOT, url)
      if (path !== null) expect(path.startsWith(ROOT + sep), url).toBe(true)
    }
  })
})

describe('isServableMedia', () => {
  for (const path of ['a/b.png', 'a/b.jpg', 'a/b.jpeg', 'a/b.webp', 'a/b.gif', 'a/b.avif', 'a/B.PNG']) {
    it(`serves ${path}`, () => {
      expect(isServableMedia(path)).toBe(true)
    })
  }

  // Nothing a story can show, and no reason to hand it to the renderer.
  for (const path of ['a/b.ink', 'a/b.json', 'a/b.md', 'a/b.exe', 'a/b']) {
    it(`refuses ${path}`, () => {
      expect(isServableMedia(path)).toBe(false)
    })
  }
})

describe('mediaUrl', () => {
  it('builds a URL the protocol resolves back to the same file', () => {
    const url = mediaUrl('projects/x/media/bg/cove.png')

    expect(url).toBe('app://media/projects/x/media/bg/cove.png')
    expect(resolveMediaRequest(ROOT, url)).toBe(
      join(ROOT, 'projects', 'x', 'media', 'bg', 'cove.png')
    )
  })

  it('encodes a filename that needs it, and round-trips it', () => {
    const url = mediaUrl('projects/x/media/the cove.png')

    expect(url).toContain('the%20cove.png')
    expect(resolveMediaRequest(ROOT, url)).toBe(join(ROOT, 'projects', 'x', 'media', 'the cove.png'))
  })

  it('takes a Windows path as readily as a posix one', () => {
    expect(mediaUrl(['projects', 'x', 'a.png'].join(sep))).toBe('app://media/projects/x/a.png')
  })
})
