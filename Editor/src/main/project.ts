import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { slugify } from '@shared/codex'
import { isIdOf, newId } from '@shared/ids'
import type { Project, ProjectFile, ProjectProtection } from '@shared/project'
import { DEFAULT_DESKTOP_RELEASE, isDesktopPlatform, type DesktopRelease } from '@shared/desktop'
import { exists, walkFiles } from './fs'
import { parseDocument, serialiseDocument } from './markdown'
import { stripBom } from './text'

/** The project's manifest: title, linked libraries, entry point, premise. */
const MANIFEST = 'project.md'

/** Stories live under here, in whatever folders suit the project. */
const INK_DIR = 'ink'

const STARTER_MAIN = `// The story starts here.

-> start

=== start ===
Something is about to happen.

* [Let it]
    -> END
`

export async function listProjects(projectsRoot: string): Promise<Project[]> {
  let contents
  try {
    contents = await readdir(projectsRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const projects = await Promise.all(
    contents
      .filter((item) => item.isDirectory())
      .map((item) => readProject(join(projectsRoot, item.name)))
  )

  return projects
    .filter((project): project is Project => project !== null)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function readProject(projectPath: string): Promise<Project | null> {
  let contents: string
  try {
    contents = stripBom(await readFile(join(projectPath, MANIFEST), 'utf8'))
  } catch {
    // A directory without a manifest is not a project.
    return null
  }

  const { data, body } = parseDocument(contents)
  const stored = typeof data['id'] === 'string' ? data['id'] : ''
  const libraries = Array.isArray(data['libraries'])
    ? data['libraries'].filter((id): id is string => typeof id === 'string' && isIdOf(id, 'lib'))
    : []
  const protection = parseProtection(data['protection'])
  const desktop = parseDesktop(data['desktop'])

  const project: Project = {
    id: isIdOf(stored, 'prj') ? stored : newId('prj'),
    title: typeof data['title'] === 'string' ? data['title'] : projectPath.split(sep).pop()!,
    libraries,
    main: typeof data['main'] === 'string' ? data['main'] : `${INK_DIR}/main.ink`,
    description: body,
    bundleOut: typeof data['bundleOut'] === 'string' && data['bundleOut'].length > 0
      ? data['bundleOut']
      : null,
    ...(protection ? { protection } : {}),
    ...(desktop ? { desktop } : {}),
    path: projectPath
  }

  // A generated id must be written back, or it would differ on every load.
  if (!isIdOf(stored, 'prj')) await saveProject(project)

  return project
}

export async function saveProject(project: Project): Promise<void> {
  await mkdir(project.path, { recursive: true })
  await writeFile(
    join(project.path, MANIFEST),
    serialiseDocument(
      {
        id: project.id,
        title: project.title,
        libraries: project.libraries,
        main: project.main,
        ...(project.bundleOut === null ? {} : { bundleOut: project.bundleOut }),
        ...(project.protection ? { protection: project.protection } : {}),
        ...(project.desktop ? { desktop: project.desktop } : {})
      },
      project.description
    ),
    'utf8'
  )
}

/**
 * The desktop release settings, or null when the project has never had any.
 *
 * Lenient on the way in: a platform this version does not know is dropped
 * rather than failing the whole project, and an empty platform list falls back
 * to all of them — an export with nothing selected is not a thing to remember.
 */
function parseDesktop(value: unknown): DesktopRelease | null {
  if (typeof value !== 'object' || value === null) return null
  const one = value as Record<string, unknown>
  const platforms = Array.isArray(one['platforms'])
    ? one['platforms'].filter(isDesktopPlatform)
    : []
  const steamAppId = Number(one['steamAppId'])
  return {
    outDir: typeof one['outDir'] === 'string' && one['outDir'].length > 0 ? one['outDir'] : null,
    steamAppId: Number.isInteger(steamAppId) && steamAppId > 0 ? steamAppId : null,
    platforms: platforms.length > 0 ? platforms : [...DEFAULT_DESKTOP_RELEASE.platforms]
  }
}

function parseProtection(value: unknown): ProjectProtection | null {
  if (typeof value !== 'object' || value === null) return null
  const one = value as Record<string, unknown>
  return one['mode'] === 'protected' &&
    typeof one['keyId'] === 'string' && one['keyId'].length > 0 &&
    typeof one['publicKey'] === 'string' && one['publicKey'].length > 0
    ? { mode: 'protected', keyId: one['keyId'], publicKey: one['publicKey'] }
    : null
}

export async function createProject(projectsRoot: string, title: string): Promise<Project> {
  const trimmed = title.trim() || 'Untitled project'
  const base = slugify(trimmed)

  let folder = base
  for (let suffix = 2; await exists(join(projectsRoot, folder)); suffix++) folder = `${base}-${suffix}`

  const project: Project = {
    id: newId('prj'),
    title: trimmed,
    libraries: [],
    main: `${INK_DIR}/main.ink`,
    description: '',
    bundleOut: null,
    path: join(projectsRoot, folder)
  }

  await mkdir(join(project.path, INK_DIR), { recursive: true })
  await writeFile(join(project.path, `${INK_DIR}${sep}main.ink`), STARTER_MAIN, 'utf8')
  await saveProject(project)

  return project
}

/** Every `.ink` file the project owns, for the file tree. */
export async function listInkFiles(project: Project): Promise<ProjectFile[]> {
  const files = await walkFiles(project.path, (name) => name.toLowerCase().endsWith('.ink'))
  return files
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({ path, absolutePath: join(project.path, path.split('/').join(sep)) }))
}
