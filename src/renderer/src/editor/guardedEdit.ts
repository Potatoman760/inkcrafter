import type { TextEdit } from '@shared/inkEdits'

/**
 * A range edit together with the exact editor snapshot it was calculated from.
 *
 * Context-menu ranges are character offsets. Replaying one after the document
 * changes (or after the editor is remounted for another file) can put a tag
 * body into unrelated prose, so these edits are deliberately single-snapshot.
 */
export interface GuardedTextEdit extends TextEdit {
  nonce: number
  source: string
  filePath: string
}

/** Refuses a range whose meaning may have changed since the menu opened. */
export function canApplyGuardedEdit(
  edit: GuardedTextEdit,
  source: string,
  filePath: string | null
): boolean {
  return (
    edit.filePath === filePath &&
    edit.source === source &&
    edit.from >= 0 &&
    edit.to >= edit.from &&
    edit.to <= source.length
  )
}
