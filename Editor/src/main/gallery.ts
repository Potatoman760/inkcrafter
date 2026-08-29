import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyGallery,
  parseGallery,
  serialiseGallery,
  type GalleryDocument
} from '@shared/bundle/galleryDoc'
import type { Project } from '@shared/project'
import { stripBom } from './text'

const GALLERY_FILE = 'gallery.json'

export async function readGallery(project: Project): Promise<GalleryDocument> {
  try {
    return parseGallery(stripBom(await readFile(join(project.path, GALLERY_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return emptyGallery()
  }
}

export async function writeGallery(project: Project, doc: GalleryDocument): Promise<void> {
  await writeFile(join(project.path, GALLERY_FILE), serialiseGallery(doc), 'utf8')
}
