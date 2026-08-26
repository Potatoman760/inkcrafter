import { dirname } from 'node:path'
import { dialog, type FileFilter } from 'electron'
import { lastUploadDir, setLastUploadDir } from './settings'

/**
 * Opens a file picker in the directory used by the previous media upload.
 *
 * Kept here rather than at the one current call site so every kind of media —
 * pictures, clips, music and sound effects — shares one app-specific history,
 * and another upload picker cannot accidentally start forgetting again.
 */
export async function chooseUploadFile(
  title: string,
  filters: FileFilter[]
): Promise<string | null> {
  const previous = await lastUploadDir()
  const chosen = await dialog.showOpenDialog({
    title,
    properties: ['openFile'],
    filters,
    ...(previous === null ? {} : { defaultPath: previous })
  })

  const file = chosen.canceled ? null : (chosen.filePaths[0] ?? null)
  if (file === null) return null

  await setLastUploadDir(dirname(file))
  return file
}
