import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { Compiler, CompilerOptions } from 'inkjs/compiler/Compiler'
import type { IFileHandler } from 'inkjs/compiler/IFileHandler'
import type { Story } from 'inkjs/engine/Story'
import type { CompileRequest, CompileResult, InkDiagnostic } from '@shared/types'
import { stripBom } from '../text'

/**
 * Resolves `INCLUDE` statements against the directory of the root ink file.
 * inkjs ships a PosixFileHandler, but it resolves relative to `process.cwd()`,
 * which is wrong for us — the project root is wherever the author's file lives.
 */
class ProjectFileHandler implements IFileHandler {
  /** Every file this compile read, so the caller can tell what was included. */
  readonly read = new Set<string>()

  constructor(
    private readonly rootDir: string,
    private readonly overrides: Record<string, string> = {}
  ) {}

  readonly ResolveInkFilename = (filename: string): string => resolve(this.rootDir, filename)

  readonly LoadInkFileContents = (filename: string): string => {
    const path = this.ResolveInkFilename(filename)
    this.read.add(path)

    // An unsaved buffer wins over disk, so the editor compiles what is on
    // screen even when the file it is showing is only an INCLUDE of the root.
    const override = this.overrides[path]
    if (override !== undefined) return override

    try {
      return stripBom(readFileSync(path, 'utf8'))
    } catch (cause) {
      throw missingIncludeError(this.rootDir, path, cause)
    }
  }
}

/**
 * A missing INCLUDE, explained.
 *
 * `INCLUDE chapter1` is a common thing to write and is wrong: ink resolves the
 * name literally, so it looks for a file called `chapter1` with no extension.
 * The bare ENOENT that follows says what could not be opened but not why, and
 * the answer is nearly always a missing `.ink`.
 *
 * Deliberately *not* fixed by falling back to `${filename}.ink`. inklecate
 * resolves it literally too, so accepting it here would compile a story that
 * fails everywhere else — and the ink being portable is the point of the app.
 */
function missingIncludeError(rootDir: string, path: string, cause: unknown): Error {
  if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') return cause as Error
  if (path.toLowerCase().endsWith('.ink') || !existsSync(`${path}.ink`)) return cause as Error

  // Named the way the author wrote it, not as the absolute path ink resolved
  // it to — the message is about a line in their file.
  const wrote = relative(rootDir, path).split(sep).join('/')

  return new Error(
    `there is no file called '${wrote}', but '${wrote}.ink' is beside it. ` +
      'An INCLUDE needs the whole filename, extension included.'
  )

  return cause as Error
}

/**
 * ink reports diagnostics as pre-formatted strings, e.g.
 *   ERROR: 'chapter1.ink' line 12: Expected target for divert
 *   WARNING: line 4: Apparent loose end
 * Pull the structure back out so the editor can put a squiggle on the right line.
 */
const DIAGNOSTIC_PATTERN = /^(ERROR|WARNING|TODO):\s*(?:'([^']*)'\s*)?line (\d+):\s*(.*)$/i

function parseDiagnostic(raw: string, fallbackSeverity: InkDiagnostic['severity'], rootDir: string): InkDiagnostic {
  const match = DIAGNOSTIC_PATTERN.exec(raw.trim())
  if (!match) {
    return { severity: fallbackSeverity, message: raw.trim(), file: null, line: null, raw }
  }

  // Groups 1, 3 and 4 cannot be absent when the pattern matched, but the
  // defaults keep a malformed compiler message from becoming a crash.
  const [, kind = '', file, line = '', message = ''] = match
  const severity = kind.toLowerCase()

  return {
    severity: (severity === 'error' || severity === 'warning' || severity === 'todo'
      ? severity
      : fallbackSeverity) satisfies InkDiagnostic['severity'],
    message,
    file: file ? resolve(rootDir, file) : null,
    line: Number.parseInt(line, 10) || null,
    raw
  }
}

/**
 * Compiles ink source to runtime story JSON.
 *
 * This never throws for authoring errors — a story that does not compile is the
 * normal state of a file being typed into, not an exceptional one. Diagnostics
 * come back in the result and the caller decides what to do with them.
 */
export interface CompiledStory {
  /** Null when compilation failed. */
  story: Story | null
  diagnostics: InkDiagnostic[]
  durationMs: number
  filesRead: string[]
}

/**
 * Compiles to a live `Story` object.
 *
 * The manuscript needs this rather than the JSON below, because debug metadata
 * lives only on the compiler's in-memory story — `JsonSerialisation` does not
 * write it, so a story reloaded from JSON can never say which source line
 * produced a line of prose.
 */
export interface CompileStoryOptions {
  /**
   * Records a visit count for every container, not only the ones the script
   * asks about. The manuscript's path search needs it: "has the story been to
   * this knot" is otherwise unanswerable for a knot nothing read-counts.
   */
  countAllVisits?: boolean
}

export function compileStory(
  request: CompileRequest,
  options: CompileStoryOptions = {}
): CompiledStory {
  const startedAt = performance.now()
  const rootDir = request.filePath ? dirname(request.filePath) : process.cwd()
  const diagnostics: InkDiagnostic[] = []

  const handler = new ProjectFileHandler(rootDir, request.overrides ?? {})

  const compilerOptions = new CompilerOptions(
    request.filePath,
    [],
    options.countAllVisits ?? false,
    (message, type) => {
      // ErrorType: 0 = Author (TODO), 1 = Warning, 2 = Error
      const severity: InkDiagnostic['severity'] = type === 2 ? 'error' : type === 1 ? 'warning' : 'todo'
      diagnostics.push(parseDiagnostic(message, severity, rootDir))
    },
    handler
  )

  // The root is read the same way as an INCLUDE when the caller did not supply
  // it, so an unsaved buffer for the root works and `filesRead` includes it.
  let source = request.source
  if (source === undefined && request.filePath) {
    try {
      source = handler.LoadInkFileContents(request.filePath)
    } catch (error) {
      return {
        story: null,
        diagnostics: [parseDiagnostic(String(error), 'error', rootDir)],
        durationMs: Math.round(performance.now() - startedAt),
        filesRead: []
      }
    }
  } else if (request.filePath) {
    handler.read.add(request.filePath)
  }

  let story: Story | null = null
  try {
    story = new Compiler(stripBom(source ?? ''), compilerOptions).Compile()
  } catch (error) {
    // The parser throws on errors it cannot recover from, *after* having already
    // reported them through the error handler. Only record it if nothing was
    // reported, so we never surface an empty failure.
    if (diagnostics.length === 0) {
      const message = error instanceof Error ? error.message : String(error)
      diagnostics.push(parseDiagnostic(message, 'error', rootDir))
    }
  }

  return {
    story,
    diagnostics,
    durationMs: Math.round(performance.now() - startedAt),
    filesRead: [...handler.read]
  }
}

export function compileInk(request: CompileRequest): CompileResult {
  // Counted, because the preview asks ink which knot a line came from so it can
  // stop at the end of the section being previewed, and a visit count is the
  // only answer available once the story has run out of content. The export
  // compiles this way too, so the preview and the shipped build agree.
  const { story, diagnostics, durationMs, filesRead } = compileStory(request, {
    countAllVisits: true
  })
  const hasErrors = diagnostics.some((d) => d.severity === 'error')

  // ToJson() is typed `string | void` because it can write into a supplied
  // writer instead; with no writer it always returns the string.
  const storyJson = story === null || hasErrors ? null : (story.ToJson() as string)

  return { ok: storyJson !== null, storyJson, diagnostics, durationMs, filesRead }
}
