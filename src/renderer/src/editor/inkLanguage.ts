import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
  type StringStream
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * A stream-based highlighter for ink.
 *
 * ink is whitespace- and line-structure-sensitive, and the same character means
 * different things in prose than in logic (`-` is a gather at line start but a
 * minus sign inside `{}`), so the tokenizer tracks just enough state to tell
 * those apart. This is deliberately not a full parser — inkjs already owns
 * parsing, and its errors come back through the compiler as diagnostics.
 */
interface InkState {
  inBlockComment: boolean
  braceDepth: number
  /** True on lines that are logic rather than prose (`~`, `VAR`, `CONST`, ...). */
  logicLine: boolean
}

const LOGIC_KEYWORDS = new Set([
  'temp',
  'return',
  'else',
  'not',
  'and',
  'or',
  'mod',
  'ref',
  'function',
  'has',
  'hasnt',
  'LIST_ALL',
  'LIST_COUNT',
  'LIST_MIN',
  'LIST_MAX',
  'LIST_RANDOM',
  'LIST_VALUE',
  'LIST_INVERT',
  'LIST_RANGE',
  'CHOICE_COUNT',
  'TURNS',
  'TURNS_SINCE',
  'SEED_RANDOM',
  'RANDOM',
  'INT',
  'FLOOR',
  'FLOAT',
  'POW'
])

const ATOMS = new Set(['true', 'false'])

/** True when everything before the current token on this line is whitespace. */
function atLineContentStart(stream: StringStream): boolean {
  return /^\s*$/.test(stream.string.slice(0, stream.start))
}

function token(stream: StringStream, state: InkState): string | null {
  if (stream.sol()) state.logicLine = false

  if (state.inBlockComment) {
    if (stream.match(/^.*?\*\//)) state.inBlockComment = false
    else stream.skipToEnd()
    return 'comment'
  }

  const lineStart = atLineContentStart(stream)
  if (stream.eatSpace()) return null

  if (stream.match('//')) {
    stream.skipToEnd()
    return 'comment'
  }

  if (stream.match('/*')) {
    if (!stream.match(/^.*?\*\//)) {
      state.inBlockComment = true
      stream.skipToEnd()
    }
    return 'comment'
  }

  // Author messages surface in the compiler output, so flag them distinctly.
  if (stream.match(/^TODO\s*:/i)) {
    stream.skipToEnd()
    return 'meta'
  }

  if (lineStart) {
    // `=== knot ===`, `=== function name(args) ===`
    if (stream.match(/^={2,}\s*(?:function\s+)?[A-Za-z_]\w*/)) return 'heading'
    // `= stitch`
    if (stream.match(/^=\s*[A-Za-z_]\w*/)) return 'heading'

    if (stream.match(/^(?:VAR|CONST|LIST|EXTERNAL|INCLUDE)\b/)) {
      state.logicLine = true
      return 'keyword'
    }

    // Choice bullets (`*`, `+`) and gathers (`-`), which may be nested: `* * *`.
    if (stream.match(/^[*+](?:\s*[*+])*/)) return 'keyword'
    // A gather dash, but not the `->` of a divert.
    if (stream.match(/^-(?![>-])(?:\s*-(?![>-]))*/)) return 'keyword'
  }

  // Diverts, tunnels, threads and glue.
  if (stream.match(/^(?:->->|->|<-|<>)/)) return 'link'

  if (stream.match('~')) {
    state.logicLine = true
    return 'operator'
  }

  // Tags run to the end of the line.
  if (stream.match('#')) {
    stream.skipToEnd()
    return 'meta'
  }

  if (stream.match('{')) {
    state.braceDepth++
    return 'punctuation'
  }

  if (stream.match('}')) {
    state.braceDepth = Math.max(0, state.braceDepth - 1)
    return 'punctuation'
  }

  // `|` separates alternatives, but only inside `{}`.
  if (state.braceDepth > 0 && stream.match('|')) return 'punctuation'

  // Choice and gather labels: `(label)`.
  if (stream.match(/^\([A-Za-z_]\w*\)/)) return 'labelName'

  if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string'

  const inLogic = state.logicLine || state.braceDepth > 0

  if (inLogic && stream.match(/^\d+(?:\.\d+)?\b/)) return 'number'

  if (stream.match(/^[A-Za-z_]\w*(?:\.\w+)*/)) {
    const word = stream.current()
    if (inLogic && LOGIC_KEYWORDS.has(word)) return 'keyword'
    if (inLogic && ATOMS.has(word)) return 'atom'
    // Prose is left unstyled so that the story text stays readable.
    return null
  }

  if (inLogic && stream.match(/^(?:==|!=|<=|>=|&&|\|\||[+\-*/%<>=!?:])/)) return 'operator'

  stream.next()
  return null
}

export const inkStreamLanguage = StreamLanguage.define<InkState>({
  name: 'ink',
  startState: () => ({ inBlockComment: false, braceDepth: 0, logicLine: false }),
  token,
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } }
  }
})

/**
 * Ink source colouring, one token per tag.
 *
 * The colours are the design system's `--syntax-*` custom properties rather
 * than literals: CodeMirror compiles this object into real CSS rules, so a
 * `var()` resolves exactly as it would in the stylesheet. Registering a single
 * style with no `themeType` is deliberate — the tokens are redefined under
 * `[data-theme="light"]`, so one style serves both themes.
 *
 * Weight and slant stay hardcoded. They are structure, not palette.
 */
export const inkHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.heading, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: t.keyword, color: 'var(--syntax-keyword)', fontWeight: 'bold' },
  { tag: t.link, color: 'var(--syntax-link)', fontWeight: 'bold' },
  { tag: t.operator, color: 'var(--syntax-operator)' },
  { tag: t.meta, color: 'var(--syntax-meta)', fontStyle: 'italic' },
  { tag: t.punctuation, color: 'var(--syntax-operator)' },
  { tag: t.labelName, color: 'var(--syntax-label)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: t.number, color: 'var(--syntax-number)' },
  { tag: t.atom, color: 'var(--syntax-number)' }
])

export function ink(): LanguageSupport {
  return new LanguageSupport(inkStreamLanguage, [syntaxHighlighting(inkHighlightStyle)])
}
