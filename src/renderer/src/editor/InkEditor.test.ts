// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { editorTheme } from './InkEditor'

let view: EditorView | null = null

afterEach(() => {
  view?.destroy()
  view = null
})

describe('InkEditor selection', () => {
  it('does not paint another identical tag as though it were selected', () => {
    const tag = '# music:stop'
    const source = `${tag}\nProse ${tag} continues.\n`
    const selected = source.lastIndexOf(tag)
    const parent = document.createElement('div')
    document.body.append(parent)

    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        selection: { anchor: selected, head: selected + tag.length },
        extensions: [basicSetup, editorTheme]
      })
    })

    const duplicate = parent.querySelector<HTMLElement>('.cm-selectionMatch')
    expect(duplicate).not.toBeNull()
    expect(getComputedStyle(duplicate!).backgroundColor).toBe('rgba(0, 0, 0, 0)')

    view.dispatch(view.state.replaceSelection(''))
    expect(view.state.doc.toString()).toBe(`${tag}\nProse  continues.\n`)
  })

  it('opens CodeMirror full-document search with Ctrl+F', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    view = new EditorView({
      parent,
      state: EditorState.create({ doc: 'A long ink file.', extensions: [basicSetup, editorTheme] })
    })
    view.focus()

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })
    )

    expect(parent.querySelector('.cm-search')).not.toBeNull()
  })
})
