import { useEffect, useRef, useState } from 'react'
import { slugifyPath } from '@shared/codex'
import type { InkReference } from '@shared/inkRefs'
import type { Project, ProjectFile } from '@shared/project'
import { Icon } from '../design/Icon'
import {
  Badge,
  Button,
  Dialog,
  DialogSpacer,
  Field,
  GroupLabel,
  Hint,
  IconButton,
  Input,
  ListRow,
  Menu,
  MenuItem,
  MenuSeparator,
  PaneHeader
} from '../design/components'
import { copy } from '@shared/copy'

export interface FileTreeProps {
  project: Project
  files: ProjectFile[]
  /** Every folder that could hold ink, including the ones with nothing in them. */
  folders: string[]
  activePath: string | null
  onSelect: (file: ProjectFile) => void
  /** Double-click, or Enter: bring the file up in the editor, whatever view is open. */
  onOpen: (file: ProjectFile) => void
  onAdd: (path: string) => void
  onAddFolder: (path: string) => void
  /** Copies a file into a folder, under a free name. */
  onCopy: (from: string, toFolder: string) => void
  /** Rename or move. `to` is project-relative and carries the extension. */
  onMove: (from: string, to: string) => void
  /** What points at a path, for the question a delete has to ask first. */
  onReferences: (path: string) => Promise<InkReference[]>
  onDelete: (path: string) => void
  onSettings: () => void
  onReveal: () => void
  /** Changes when File › New File… is chosen, to focus the name input. */
  focusNewFile: number
}

/** Groups `ink/act-one/opening.ink` under `ink/act-one`. */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** What is being renamed, and what it has been typed as so far. */
interface Renaming {
  path: string
  draft: string
}

/** Where a right-click landed, and on what. */
interface Context {
  x: number
  y: number
  path: string
  kind: 'file' | 'folder'
}

/**
 * A file waiting to be pasted.
 *
 * The app's own, not the system's: what is being carried is a project-relative
 * path, which means nothing outside this window, and a cut is not a cut until
 * it is pasted — nothing is moved when Ctrl+X is pressed.
 */
interface Held {
  path: string
  mode: 'copy' | 'cut'
}

export function FileTree({
  project,
  files,
  folders,
  activePath,
  onSelect,
  onOpen,
  onAdd,
  onAddFolder,
  onCopy,
  onMove,
  onReferences,
  onDelete,
  onSettings,
  onReveal,
  focusNewFile
}: FileTreeProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const [menu, setMenu] = useState<Context | null>(null)
  /** The folder a dragged file is currently over, so it can be shown as the target. */
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [held, setHeld] = useState<Held | null>(null)
  /** The folder being named, or null when the dialog is shut. */
  const [naming, setNaming] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const draftRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Skips the first render: only an actual menu command should steal focus.
  const seen = useRef(focusNewFile)
  useEffect(() => {
    if (focusNewFile === seen.current) return
    seen.current = focusNewFile
    draftRef.current?.focus()
  }, [focusNewFile])

  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming?.path])

  /**
   * A menu is dismissed by anything that is not a choice from it.
   *
   * The test is where the pointer landed, not whether the event was stopped:
   * a React handler stopping propagation does not reliably outrun a listener
   * on `window`, and when it lost, pressing an item closed the menu before the
   * click reached it — so every command silently did nothing.
   */
  useEffect(() => {
    if (!menu) return
    const close = (event: Event): void => {
      const target = event.target
      if (target instanceof Element && target.closest('.file-menu')) return
      setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  /**
   * Every folder worth a heading: the ones that hold a file, plus the empty
   * ones, plus root when anything is loose in it.
   */
  const shown = [
    ...new Set([...files.map((file) => folderOf(file.path)), ...folders])
  ].sort((a, b) => a.localeCompare(b))

  const submit = (): void => {
    const path = slugifyPath(draft.replace(/\.ink$/i, ''))
    if (path.length === 0) return
    onAdd(path)
    setDraft('')
  }

  /**
   * Set by Escape, read by the blur that Escape causes.
   *
   * Blurring the field is what ends the rename either way, and it runs before
   * React has cleared the state — so without this, backing out committed the
   * abandoned draft.
   */
  const abandoned = useRef(false)

  const commitRename = (): void => {
    if (abandoned.current) {
      abandoned.current = false
      return
    }
    if (!renaming) return
    const { path, draft: typed } = renaming
    setRenaming(null)

    const folder = folderOf(path)
    const wanted = slugifyPath(typed.replace(/\.ink$/i, ''))
    if (wanted.length === 0) return

    // A name with no slash stays where it is; one with a slash is a move, which
    // is the same operation and worth being able to type.
    const to = `${wanted.includes('/') ? wanted : folder ? `${folder}/${wanted}` : wanted}.ink`
    if (to !== path) onMove(path, to)
  }

  /**
   * Deleting asks first, and says what it is about to break.
   *
   * The list is the point: "delete chapter1.ink" is an easy yes, and "delete
   * chapter1.ink, which main.ink includes on line 2" is a different question.
   */
  const confirmDelete = async (path: string, kind: 'file' | 'folder'): Promise<void> => {
    const references = await onReferences(path)
    const what = kind === 'folder' ? `the folder ${path} and everything in it` : path

    const message =
      references.length === 0
        ? `Delete ${what}?`
        : `Delete ${what}?\n\nStill pointed at by:\n${references
            .map((one) => (one.line ? `  ${one.file}:${one.line} — ${one.detail}` : `  ${one.detail}`))
            .join('\n')}\n\nThose will not be fixed for you.`

    if (window.confirm(message)) onDelete(path)
  }

  /**
   * Opens the naming dialog.
   *
   * Not `window.prompt`: Electron does not implement it — it throws
   * "prompt() is and will not be supported" — so the menu item did nothing at
   * all, silently, which is how it shipped.
   */
  const newFolder = (under: string): void => {
    setNaming(under)
    setFolderName('')
  }

  const commitFolder = (): void => {
    const under = naming
    const path = slugifyPath(under ? `${under}/${folderName}` : folderName)
    setNaming(null)
    setFolderName('')
    if (path.length > 0) onAddFolder(path)
  }

  /** Pastes what is held into a folder: a copy duplicates, a cut moves. */
  const paste = (into: string): void => {
    if (!held) return
    const { path, mode } = held
    if (mode === 'cut') {
      setHeld(null)
      if (folderOf(path) !== into) onMove(path, into ? `${into}/${nameOf(path)}` : nameOf(path))
      return
    }
    onCopy(path, into)
  }

  /** The folder a paste would land in, for whatever was right-clicked. */
  const folderFor = (context: Context): string =>
    context.kind === 'folder' ? context.path : folderOf(context.path)

  const openMenu = (event: React.MouseEvent, path: string, kind: 'file' | 'folder'): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, path, kind })
  }

  return (
    <>
      <PaneHeader
        className="pane-header"
        title={
          <span className="project-title" title={project.path}>
            {project.title}
          </span>
        }
        // This pane's own actions, in the slot a pane header keeps for them.
        // Lowercase, because they are small and reversible.
        actions={
          <>
            <IconButton
              icon="folder-plus"
              label="New folder"
              size="sm"
              onClick={() => newFolder('')}
            />
            <IconButton icon="settings" label="Project settings" size="sm" onClick={onSettings} />
            <IconButton icon="folder-open" label="Open project folder" size="sm" onClick={onReveal} />
          </>
        }
      />

      <div className="codex-new">
        <Input
          ref={draftRef}
          value={draft}
          placeholder="New file, e.g. ink/act-two"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
        <Button onClick={submit} disabled={draft.trim().length === 0}>
          <Icon name="plus" size={13} />
          Add
        </Button>
      </div>

      <div className="codex-list">
        {files.length === 0 && folders.length === 0 && <Hint>No ink files yet.</Hint>}

        {shown.map((folder) => {
          const inside = files.filter((file) => folderOf(file.path) === folder)

          return (
            <section
              key={folder || '/'}
              className={`codex-group${dropTarget === folder ? ' is-drop-target' : ''}`}
              // A folder is a drop target for the whole of its heading and its
              // rows, so a short list is not a small target.
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTarget(folder)
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return
                setDropTarget((current) => (current === folder ? null : current))
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDropTarget(null)
                const from = event.dataTransfer.getData('text/inkcrafter-path')
                if (!from || folderOf(from) === folder) return
                onMove(from, folder ? `${folder}/${nameOf(from)}` : nameOf(from))
              }}
              onContextMenu={(event) => openMenu(event, folder, 'folder')}
            >
              <GroupLabel>{folder || 'root'}</GroupLabel>

              {inside.length === 0 && (
                <Hint tight className="codex-group-empty">
                  Empty — drag a file here.
                </Hint>
              )}

              {inside.map((file) =>
                renaming?.path === file.path ? (
                  <Input
                    key={file.path}
                    ref={renameRef}
                    className="file-rename"
                    mono
                    size="sm"
                    aria-label={`Rename ${nameOf(file.path)}`}
                    value={renaming.draft}
                    onChange={(event) => setRenaming({ ...renaming, draft: event.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        abandoned.current = true
                        setRenaming(null)
                        event.currentTarget.blur()
                      }
                    }}
                  />
                ) : (
                  <ListRow
                    key={file.path}
                    icon="file-text"
                    mono
                    name={nameOf(file.path)}
                    className={held?.path === file.path && held.mode === 'cut' ? 'is-held' : ''}
                    selected={file.path === activePath}
                    trail={file.path === project.main && <Badge title="Entry point">main</Badge>}
                    draggable
                    onDragStart={(event) => {
                      // A private type, so nothing outside this tree reads it as
                      // something it could accept.
                      event.dataTransfer.setData('text/inkcrafter-path', file.path)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => onSelect(file)}
                    onDoubleClick={() => onOpen(file)}
                    onContextMenu={(event) => openMenu(event, file.path, 'file')}
                    // Enter is the keyboard's double-click; the click event that
                    // follows it selects, as a single click would. F2 renames,
                    // which is what F2 does everywhere else.
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onOpen(file)
                      if (event.key === 'F2') {
                        event.preventDefault()
                        setRenaming({ path: file.path, draft: nameOf(file.path) })
                      }
                      if (!(event.ctrlKey || event.metaKey)) return
                      const key = event.key.toLowerCase()
                      if (key === 'c') {
                        event.preventDefault()
                        setHeld({ path: file.path, mode: 'copy' })
                      }
                      if (key === 'x') {
                        event.preventDefault()
                        setHeld({ path: file.path, mode: 'cut' })
                      }
                      if (key === 'v') {
                        event.preventDefault()
                        paste(folderOf(file.path))
                      }
                    }}
                    title={`${file.path} — double-click to edit`}
                  />
                )
              )}
            </section>
          )
        })}
      </div>

      {menu && (
        <Menu
          className="file-menu"
          aria-label={menu.kind === 'folder' ? 'Folder actions' : 'File actions'}
          style={{ position: 'fixed', left: menu.x, top: menu.y }}
        >
          {menu.kind === 'file' && (
            <>
              <MenuItem
                icon="file-text"
                onClick={() => {
                  const file = files.find((one) => one.path === menu.path)
                  setMenu(null)
                  if (file) onOpen(file)
                }}
              >
                Open
              </MenuItem>
              <MenuItem
                icon="pencil"
                keys="F2"
                onClick={() => {
                  setRenaming({ path: menu.path, draft: nameOf(menu.path) })
                  setMenu(null)
                }}
              >
                Rename…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon="copy"
                keys="Ctrl+C"
                onClick={() => {
                  setHeld({ path: menu.path, mode: 'copy' })
                  setMenu(null)
                }}
              >
                Copy
              </MenuItem>
              <MenuItem
                icon="scissors"
                keys="Ctrl+X"
                onClick={() => {
                  setHeld({ path: menu.path, mode: 'cut' })
                  setMenu(null)
                }}
              >
                Cut
              </MenuItem>
            </>
          )}

          {/* Paste is offered wherever something is held — on a folder it goes
              in, on a file it goes beside it. Absent rather than disabled when
              there is nothing to paste: a permanently greyed item is furniture. */}
          {held && (
            <MenuItem
              icon="clipboard-paste"
              keys="Ctrl+V"
              onClick={() => {
                const into = folderFor(menu)
                setMenu(null)
                paste(into)
              }}
            >
              Paste {nameOf(held.path)}
            </MenuItem>
          )}

          <MenuItem
            icon="folder-plus"
            onClick={() => {
              const under = menu.kind === 'folder' ? menu.path : folderOf(menu.path)
              setMenu(null)
              newFolder(under)
            }}
          >
            New folder here…
          </MenuItem>

          <MenuSeparator />

          <MenuItem
            icon="trash-2"
            danger
            onClick={() => {
              const { path, kind } = menu
              setMenu(null)
              void confirmDelete(path, kind)
            }}
          >
            {menu.kind === 'folder' ? 'Delete folder…' : 'Delete…'}
          </MenuItem>
        </Menu>
      )}

      {naming !== null && (
        <Dialog
          size="sm"
          title="New folder"
          subtitle={naming ? `inside ${naming}` : 'at the top of the project'}
          onClose={() => setNaming(null)}
          footer={
            <>
              <DialogSpacer />
              <Button onClick={() => setNaming(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={folderName.trim().length === 0}
                onClick={commitFolder}
              >
                Create
              </Button>
            </>
          }
        >
          <Field label="Name" about={copy('project.newFolder')}>
            <Input
              autoFocus
              value={folderName}
              placeholder="act-two"
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && folderName.trim().length > 0) commitFolder()
              }}
            />
          </Field>
        </Dialog>
      )}
    </>
  )
}
