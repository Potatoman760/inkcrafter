import { Button, Dialog, DialogSpacer } from '../design/components'

/**
 * The open file changed on disk while it was being edited here.
 *
 * Only ever shown for a buffer with unsaved changes — a clean one is simply
 * reloaded, because there is nothing to lose and nothing to decide. Here both
 * copies are real work, so the app refuses to guess and refuses to save until
 * it is told which one wins.
 *
 * No merge, and no diff. Two buttons that each say what they destroy is a
 * smaller promise than a three-way merge nobody asked this app to be good at,
 * and the honest one: whichever copy is not kept is still in the other editor
 * or in git.
 */
export function ConflictDialog({
  path,
  onKeepMine,
  onUseTheirs
}: {
  /** Project-relative, which is how the file tree names it. */
  path: string
  onKeepMine: () => void
  onUseTheirs: () => void
}): React.JSX.Element {
  return (
    <Dialog
      title={`${path} changed on disk`}
      ariaLabel={`${path} changed on disk`}
      size="sm"
      onClose={onKeepMine}
      footer={
        <>
          <Button variant="danger" onClick={onUseTheirs}>
            Discard mine, load theirs
          </Button>
          <DialogSpacer />
          <Button variant="primary" onClick={onKeepMine}>
            Keep mine
          </Button>
        </>
      }
    >
      <p>Something outside this app wrote to this file while you were editing it.</p>
      <p>
        Keeping yours leaves your version open and unsaved, and the next save writes over the
        change on disk. Loading theirs replaces what is in the editor, and your unsaved edits
        are gone.
      </p>
    </Dialog>
  )
}
