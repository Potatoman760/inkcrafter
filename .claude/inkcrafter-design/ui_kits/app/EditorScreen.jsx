import React from 'react'

/* Token colours map one-to-one onto the lezer tags the app's
   StreamLanguage emits (editor/inkLanguage.ts): heading for knots and
   stitches, keyword for bullets/gathers/VAR, link for diverts, operator
   for ~ and braces, meta for tags and TODO, labelName for (labels),
   number for numbers and true/false. Prose carries no tag at all. */
function Tokens({ spans }) {
  return spans.map((span, index) => {
    if (typeof span === 'string') return <React.Fragment key={index}>{span}</React.Fragment>
    const [tag, text] = span
    if (tag === 'mention') {
      return (
        <span key={index} style={{ color: 'var(--syntax-mention)', borderBottom: '1px dotted var(--syntax-mention)', cursor: 'pointer' }}
          title="Ctrl-click to open in the codex">{text}</span>
      )
    }
    const bold = tag === 'heading' || tag === 'keyword' || tag === 'link'
    const italic = tag === 'comment' || tag === 'meta'
    return (
      <span key={index} style={{ color: `var(--syntax-${tag})`, fontWeight: bold ? 600 : undefined, fontStyle: italic ? 'italic' : undefined }}>
        {text}
      </span>
    )
  })
}

/** The ink editor pane: gutter, real token colouring, active line. */
export function EditorScreen({ lines, activeLine, onContextMenu }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-canvas)' }} onContextMenu={onContextMenu}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', lineHeight: 1.65, padding: '10px 0' }}>
        {lines.map((line) => {
          const active = line.n === activeLine
          return (
            <div key={line.n} style={{ display: 'flex', gap: 14, padding: '0 16px 0 0', background: active ? 'var(--editor-active-line)' : 'transparent' }}>
              <span style={{ flex: 'none', width: 44, textAlign: 'right', color: active ? 'var(--text-tertiary)' : 'var(--syntax-gutter)', userSelect: 'none' }}>{line.n}</span>
              <span style={{ color: 'var(--syntax-text)', whiteSpace: 'pre' }}>
                {line.spans ? <Tokens spans={line.spans} /> : ' '}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
