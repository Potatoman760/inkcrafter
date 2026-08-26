/** `/`-separated form used by assistant tool results on every platform. */
const normal = (path: string): string => path.split('\\').join('/').replace(/^\/+|\/+$/g, '')

/**
 * Whether a workspace-relative write names the file currently open in a project.
 *
 * Assistant tools report `projects/<folder>/ink/chapter.ink`; the editor keeps
 * only `ink/chapter.ink`. Compare the complete project path so another project
 * with a chapter of the same name cannot refresh this editor by accident.
 */
export function wroteOpenProjectFile(
  written: readonly string[],
  projectPath: string,
  filePath: string
): boolean {
  const folder = normal(projectPath).split('/').at(-1)
  if (!folder) return false

  const relative = normal(filePath)
  const workspacePath = `projects/${folder}/${relative}`
  return written.some((path) => {
    const candidate = normal(path)
    return candidate === workspacePath || candidate === relative
  })
}
