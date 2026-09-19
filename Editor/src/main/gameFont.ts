import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join, parse } from 'node:path'
import type { Project } from '@shared/project'
import type { FontImportResult } from '@shared/types'
import { exists } from './fs'

export const FONT_EXTENSIONS = ['woff2', 'woff', 'ttf', 'otf'] as const

const FONT_DIR = 'fonts'

/** Copy a web-loadable font into the project without overwriting an existing file. */
export async function importGameFont(project: Project, chosen: string): Promise<FontImportResult> {
  const extension = extname(chosen).toLowerCase()
  const nothing = { ok: false, cancelled: false, file: null, message: '' }
  if (!FONT_EXTENSIONS.some((candidate) => extension === `.${candidate}`)) {
    return { ...nothing, message: 'Choose a WOFF2, WOFF, TTF or OTF font file.' }
  }

  const bytes = await stat(chosen).then((info) => info.size, () => 0)
  if (bytes === 0) return { ...nothing, message: 'That font file is empty or could not be read.' }

  const stem = safeStem(parse(basename(chosen)).name)
  const file = await freeFontFile(project, `${stem}${extension}`)
  const destination = join(project.path, FONT_DIR, file)
  try {
    await mkdir(join(project.path, FONT_DIR), { recursive: true })
    await copyFile(chosen, destination)
    return { ok: true, cancelled: false, file: `${FONT_DIR}/${file}`, message: '' }
  } catch (cause) {
    return {
      ...nothing,
      message: `Could not copy the font: ${cause instanceof Error ? cause.message : String(cause)}`
    }
  }
}

async function freeFontFile(project: Project, wanted: string): Promise<string> {
  const extension = extname(wanted)
  const stem = wanted.slice(0, -extension.length)
  for (let attempt = 1; attempt < 100; attempt += 1) {
    const candidate = attempt === 1 ? wanted : `${stem}-${attempt}${extension}`
    if (!(await exists(join(project.path, FONT_DIR, candidate)))) return candidate
  }
  return `${stem}-${Date.now()}${extension}`
}

function safeStem(value: string): string {
  const clean = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '')
  return clean || 'font'
}
