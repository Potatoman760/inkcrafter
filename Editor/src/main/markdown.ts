import { Document, parse as parseYaml } from 'yaml'

/**
 * Markdown with YAML frontmatter, used for every file the app writes:
 * projects, codex libraries and codex entries alike.
 *
 * Structured fields go in the frontmatter and prose goes in the body, so a file
 * stays readable in any editor, greps like text, and diffs line by line.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface ParsedDocument {
  data: Record<string, unknown>
  body: string
}

/**
 * Splits frontmatter from body. Malformed YAML costs the metadata but never the
 * prose, and never throws — a hand-edited file must not be able to break the app.
 */
export function parseDocument(contents: string): ParsedDocument {
  const match = FRONTMATTER.exec(contents)
  if (!match) return { data: {}, body: contents.trim() }

  let data: Record<string, unknown> = {}
  try {
    const parsed = parseYaml(match[1]!)
    if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>
  } catch {
    // Keep the prose, drop the metadata.
  }

  return { data, body: contents.slice(match[0].length).trim() }
}

/**
 * `decorate` gets the YAML document before it is stringified, which is how
 * opaque ids get their human-readable trailing comments.
 */
export function serialiseDocument(
  data: Record<string, unknown>,
  body: string,
  decorate?: (document: Document) => void
): string {
  const document = new Document(data)
  decorate?.(document)
  const frontmatter = document.toString({ lineWidth: 0 })
  return `---\n${frontmatter}---\n\n${body.trim()}\n`
}
