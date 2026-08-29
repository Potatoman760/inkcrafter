import React from 'react'

/* Structure follows manuscript/ManuscriptView.tsx and JunctionCard.tsx:
   entry path as the heading, "N words · N choices taken", an optional
   traced note, the double-click hint, prose paragraphs each with a
   trailing source line-number button, and a junction card per choice
   listing every option — chosen one marked and disabled. */
function Prose({ node, selected, onSelect }) {
  const parts = node.mention ? node.text.split(node.mention) : [node.text]
  return (
    <p className={`ic-ms-prose${selected ? ' is-in-section' : ''}`} onClick={onSelect}
      style={{
        position: 'relative', margin: '0 0 18px', padding: '2px 0 2px 14px',
        borderLeft: `2px solid ${selected ? 'var(--accent-signal)' : 'transparent'}`,
        fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 'var(--leading-read)',
        color: 'var(--text-primary)', textWrap: 'pretty', cursor: 'text'
      }}>
      {parts.length === 2 ? (
        <>{parts[0]}<button type="button" style={{ padding: 0, border: 0, background: 'none', font: 'inherit', color: 'var(--syntax-mention)', borderBottom: '1px dotted var(--syntax-mention)', cursor: 'pointer' }} title="Open codex entry">{node.mention}</button>{parts[1]}</>
      ) : node.text}
      <button type="button" title={`ink/chapter3.ink:${node.line}`}
        style={{ marginLeft: 8, padding: 0, border: 0, background: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', verticalAlign: 'super' }}>
        {node.line}
      </button>
    </p>
  )
}

function Junction({ node }) {
  const pending = node.chosenIndex === null
  return (
    <div style={{
      margin: '18px 0 22px', border: '1px solid ' + (pending ? 'var(--state-warning)' : 'var(--border-default)'),
      borderRadius: 'var(--radius-lg)', background: 'var(--surface-raised)', overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--surface-pane)' }}>
        <Icon name="git-branch" size={13} style={{ color: pending ? 'var(--state-warning)' : 'var(--accent-branch)' }} />
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Choice {node.ordinal}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          {pending ? 'pick one to continue' : 'choosing again discards everything below'}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {node.choices.map((choice) => {
          const chosen = choice.index === node.chosenIndex
          return (
            <li key={choice.index} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="ic-row" disabled={chosen}
                style={{ fontFamily: 'var(--font-read)', fontSize: 'var(--text-sm)', color: chosen ? 'var(--text-primary)' : 'var(--text-secondary)', opacity: 1 }}>
                <span className="ic-row__icon" style={{ width: 12, color: 'var(--accent-branch)' }}>{chosen ? '▸' : ''}</span>
                <span className="ic-row__body"><span className="ic-row__name">{choice.text}</span></span>
              </button>
              <button type="button" title={`ink/chapter3.ink:${choice.line}`}
                style={{ flex: 'none', padding: 0, border: 0, background: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                {choice.line}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The reading view: compiled prose at a fixed measure, junctions in place. */
export function ManuscriptScreen({ manuscript, selected, onSelect }) {
  let section = 0
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-canvas)' }}>
      <div style={{ maxWidth: 'var(--measure-read)', margin: '0 auto', padding: '28px 24px 56px' }}>
        <header style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--border-hairline)' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)' }}>{manuscript.entryLabel}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            {manuscript.wordCount} words · {manuscript.choicesTaken} choices taken{manuscript.complete ? ' · complete' : ''}
          </p>
          {manuscript.traced && (
            <p style={{ margin: '8px 0 0', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--state-info-bg)', fontSize: 'var(--text-xs)', color: 'var(--text-accent)' }}>
              Traced to <code>{manuscript.traced.knot}</code> in {manuscript.traced.steps} choices. Other routes may reach it too.
            </p>
          )}
        </header>

        <p style={{ margin: '0 0 18px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          Double-click a line to rewrite it in the ink.
        </p>

        {manuscript.nodes.map((node, index) => {
          if (node.kind === 'prose') {
            const own = section
            return <Prose key={index} node={node} selected={selected === own} onSelect={() => onSelect(own)} />
          }
          section += 1
          return <Junction key={index} node={node} />
        })}
      </div>
    </div>
  )
}
