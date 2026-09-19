import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join, parse, relative, sep } from 'node:path'
import type { Project } from '@shared/project'
import type { IconFile, IconImportResult } from '@shared/types'
import { exists, walkFiles } from './fs'
import { isServableMedia, mediaUrl } from './mediaProtocol'
import { dataDir } from './workspace'

export const ICON_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const
const ICON_DIR = 'icons'
const ICON_FILE = /^icons\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g)$/i

/** Copy a portable desktop icon into the project without overwriting one. */
export async function importGameIcon(project: Project, chosen: string): Promise<IconImportResult> {
  const extension = extname(chosen).toLowerCase()
  const nothing = { ok: false, cancelled: false, file: null, url: null, message: '' }
  if (!ICON_EXTENSIONS.some((candidate) => extension === `.${candidate}`)) {
    return { ...nothing, message: 'Choose a PNG or JPEG image.' }
  }

  const bytes = await stat(chosen).then((info) => info.size, () => 0)
  if (bytes === 0) return { ...nothing, message: 'That image is empty or could not be read.' }

  const stem = safeStem(parse(basename(chosen)).name)
  const leaf = await freeIconFile(project, `${stem}${extension}`)
  const file = `${ICON_DIR}/${leaf}`
  const destination = join(project.path, ICON_DIR, leaf)
  try {
    await mkdir(join(project.path, ICON_DIR), { recursive: true })
    await copyFile(chosen, destination)
    return { ok: true, cancelled: false, file, url: iconUrl(project, file), message: '' }
  } catch (cause) {
    return {
      ...nothing,
      message: `Could not copy the icon: ${cause instanceof Error ? cause.message : String(cause)}`
    }
  }
}

export function iconUrl(project: Project, file: string): string | null {
  const clean = file.trim().split('\\').join('/')
  if (!ICON_FILE.test(clean)) return null
  const absolute = join(project.path, ...clean.split('/'))
  const workspacePath = relative(dataDir(), absolute).split(sep).join('/')
  return isServableMedia(absolute) ? mediaUrl(workspacePath) : null
}

export async function listGameIcons(project: Project): Promise<IconFile[]> {
  const found = await walkFiles(join(project.path, ICON_DIR), (file) =>
    ICON_EXTENSIONS.some((extension) => file.toLowerCase().endsWith(`.${extension}`))
  )
  return found
    .filter((leaf) => !leaf.includes('/'))
    .map((leaf) => {
      const file = `${ICON_DIR}/${leaf}`
      return { file, url: iconUrl(project, file)! }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}

async function freeIconFile(project: Project, wanted: string): Promise<string> {
  const extension = extname(wanted)
  const stem = wanted.slice(0, -extension.length)
  for (let attempt = 1; attempt < 100; attempt += 1) {
    const candidate = attempt === 1 ? wanted : `${stem}-${attempt}${extension}`
    if (!(await exists(join(project.path, ICON_DIR, candidate)))) return candidate
  }
  return `${stem}-${Date.now()}${extension}`
}

function safeStem(value: string): string {
  const clean = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '')
  return clean || 'app-icon'
}
