import type { Project } from '@shared/project'

/**
 * What every catalogue tool needs before it can trust a model's arguments.
 *
 * A tool schema is a request, not a guarantee: the arguments arrive as whatever
 * JSON came back, and a field declared `string` can be a number, absent, or an
 * object. Each of these turns one of those into the thing the document actually
 * holds, so the readers above them stay about the document rather than about
 * defending themselves.
 */

export const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function needProject(project: Project | null): Project {
  if (!project) throw new Error('No project is open. Ask the author which project this is for.')
  return project
}

/** The workspace-relative folder of a project, for reporting what was written. */
export function projectFolder(project: Project): string {
  return `projects/${project.path.split(/[\\/]/).filter(Boolean).pop()}`
}
