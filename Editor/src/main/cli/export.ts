import { watch } from 'node:fs'
import { basename, resolve, sep } from 'node:path'
import type { Project } from '@shared/project'
import { readProject } from '../project'
import { exportBundle } from '../bundle'
import { readNpcs, writeNpcs } from '../npcs'

/**
 * Exporting a bundle from a terminal.
 *
 * The exporter deliberately depends on nothing but the filesystem, and this is
 * what that buys: the same code the app runs can be driven by a script, a watch
 * task or a CI job, without Electron and without a window. Useful long before
 * any of that, too — it is how the handoff to a player gets tested.
 *
 *   npm run export -- --project data/projects/the-lighthouse --out ../game/public/bundle
 *
 * `--sync` first regenerates `ink/state.ink` from the catalogues, which is what
 * the app does whenever one is saved. Useful when the catalogues were edited
 * outside the app, and harmless when they were not.
 *
 * `--watch` re-exports whenever anything in the project changes. Pointed at a
 * dev server's static folder, that is the whole iteration loop: save the ink,
 * reload the browser. Without it, moving the story into an editor would have
 * cost the game the hot reload it used to have.
 */
export async function run(argv: string[]): Promise<number> {
  const args = parse(argv)

  const projectPath = args['project']
  const outPath = args['out']

  if (!projectPath || !outPath) {
    console.error('usage: export --project <project directory> --out <bundle directory>')
    return 2
  }

  const project = await readProject(resolve(projectPath))
  if (!project) {
    console.error(`${projectPath} has no project.md, so it is not a project.`)
    return 2
  }

  if (argv.includes('--protected') && !project.protection) {
    console.error('This project has no release key. Enable content protection in Project settings first.')
    return 2
  }

  const options = { forcePlain: argv.includes('--plain') }

  if (argv.includes('--sync')) {
    const { written } = await writeNpcs(project, await readNpcs(project))
    console.log(`Regenerated ${written.join(', ')}`)
  }

  if (argv.includes('--watch')) return watchAndExport(project, resolve(outPath), options)

  const result = await exportBundle(project, resolve(outPath), options)

  for (const diagnostic of result.diagnostics) {
    const where = diagnostic.line === null ? '' : ` line ${diagnostic.line}`
    console.error(`${diagnostic.severity.toUpperCase()}:${where} ${diagnostic.message}`)
  }
  for (const warning of result.warnings) console.warn(`warning: ${warning}`)

  if (!result.ok) {
    console.error('Nothing was written.')
    return 1
  }

  const { manifest } = result
  console.log(
    `Exported ${project.title} to ${result.outDir}\n` +
      `  ${manifest?.assets.length ?? 0} media file(s), ${manifest?.knots.length ?? 0} knot(s)\n` +
      `  content ${manifest?.contentHash.slice(0, 12)}\n` +
      // The folder name is the handle a player has on this bundle, and saying it
      // here is what turns "it exported fine" into "and here is how to open it" —
      // the step where a wrong destination used to surface as a blank page.
      `  the player opens this as ?game=${basename(result.outDir)}`
  )
  return 0
}

/**
 * Re-exports on every change, and never exits.
 *
 * Debounced, because saving one file in an editor is routinely several
 * filesystem events, and because an export that starts while the last one is
 * still copying media would race it. Exports are serialised: a change arriving
 * mid-export queues one more run rather than starting a second.
 */
async function watchAndExport(
  project: Project,
  outDir: string,
  options: { forcePlain: boolean }
): Promise<number> {
  let running = false
  let queued = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const runOnce = async (): Promise<void> => {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      const result = await exportBundle(project, outDir, options)
      const when = new Date().toLocaleTimeString()
      if (result.ok) {
        console.log(`${when}  exported (${result.warnings.length} warning(s))`)
      } else {
        const first = result.diagnostics.find((d) => d.severity === 'error')
        console.error(`${when}  not exported — ${first?.message ?? result.warnings[0] ?? 'failed'}`)
      }
    } catch (error) {
      console.error(error)
    } finally {
      running = false
      if (queued) {
        queued = false
        void runOnce()
      }
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void runOnce(), 150)
  }

  // The output folder is deliberately not watched: writing into it is what this
  // does, and watching it would make every export trigger the next one.
  const watcher = watch(project.path, { recursive: true }, (_event, filename) => {
    // Windows hands these back with backslashes; `sep` avoids an escape.
    if (filename && filename.split(sep).join('/').startsWith('export/')) return
    schedule()
  })

  console.log(`Watching ${project.path}
  exporting to ${outDir}
  Ctrl+C to stop.`)
  await runOnce()

  await new Promise<void>((done) => {
    process.on('SIGINT', () => {
      watcher.close()
      done()
    })
  })

  return 0
}

/** `--key value` pairs. Deliberately minimal; this has two options. */
function parse(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (token?.startsWith('--')) {
      const value = argv[index + 1]
      if (value !== undefined && !value.startsWith('--')) {
        args[token.slice(2)] = value
        index++
      }
    }
  }
  return args
}
