import { useState } from 'react'
import type { Project } from '@shared/project'
import type { ProjectCheck } from '@shared/types'
import { Button, Diagnostics, Hint } from '../design/components'

interface DebugPanelProps {
  project: Project | null
  /** Saves the open buffer, so the check reads what is on screen rather than the last save. */
  onBeforeRun: () => Promise<void>
  onOpen: (path: string, line: number) => void
}

/**
 * Everything wrong with the project, on demand.
 *
 * Two kinds of problem, deliberately in one list. The compiler's are about
 * whether the ink is *ink*; preflight's are about whether what the ink names
 * exists — `# char: wren/furious` compiles perfectly and is a blank stage at
 * runtime, because ink has no opinion about what is in `media.json`. The second
 * kind used to surface only when exporting, which is a long way from where the
 * tag was typed.
 *
 * Run rather than live. The check compiles the whole story from its entry point
 * and reads every catalogue, which is not something to do between keystrokes —
 * and unlike the strip along the bottom of the window, it is about the project
 * rather than the file in front of you.
 */
export function DebugPanel({ project, onBeforeRun, onOpen }: DebugPanelProps): React.JSX.Element {
  const [result, setResult] = useState<ProjectCheck | null>(null)
  const [running, setRunning] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    if (!project) return
    setRunning(true)
    setFailure(null)
    try {
      // The buffer is what the author is asking about, and the check reads from
      // disk — an unsaved edit would otherwise be checked in its previous form.
      await onBeforeRun()
      setResult(await window.inkcrafter.project.check(project))
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }

  const errors = result?.diagnostics.filter((one) => one.severity === 'error').length ?? 0
  const warnings = result?.diagnostics.filter((one) => one.severity === 'warning').length ?? 0
  const problems = result?.problems.length ?? 0

  const counted = [
    errors > 0 ? `${errors} error${errors === 1 ? '' : 's'}` : null,
    warnings > 0 ? `${warnings} warning${warnings === 1 ? '' : 's'}` : null,
    problems > 0 ? `${problems} catalogue problem${problems === 1 ? '' : 's'}` : null
  ].filter(Boolean)

  /*
   * One list, compiler first.
   *
   * A story that does not compile has not been fully read, so its catalogue
   * problems are an incomplete account — putting the errors above them keeps
   * the thing to fix first at the top.
   */
  const items = [
    ...(result?.diagnostics ?? []).map((one) => ({
      severity: one.severity,
      message: one.message,
      line: one.line,
      // ink reports an absolute path; every other path here is
      // project-relative, and only a relative one can be opened.
      file: one.file === null ? null : relative(one.file, project)
    })),
    ...(result?.problems ?? []).map((one) => ({
      severity: 'warning' as const,
      message: one.message,
      line: one.line,
      file: one.file
    }))
  ]

  return (
    <div className="debug-panel">
      <div className="debug-run">
        <Button variant="primary" icon="play" disabled={!project || running} onClick={() => void run()}>
          {running ? 'Checking…' : 'Run check'}
        </Button>

        {/* Nothing before a run: the button already says what it does. What
            goes here afterwards is a fact — what was found, over how much. */}
        {(failure || result) && (
          <Hint tight tone={failure ? 'error' : 'default'}>
            {failure
              ? failure
              : counted.length > 0
                ? `${counted.join(' · ')} in ${result!.files} files`
                : `Clean, ${result!.files} files`}
          </Hint>
        )}
      </div>

      {/* Every row goes to its line: a problem you cannot navigate to is a dead
          end, and a message quoting a number you then hunt for by hand is the
          version of this the app used to ship. */}
      <Diagnostics
        className="debug-list"
        emptyLabel=""
        items={items}
        onSelect={(item) => {
          if (item.line === null || item.line === undefined || !item.file) return
          onOpen(item.file, item.line)
        }}
      />
    </div>
  )
}

/**
 * The project-relative form of a path ink reported absolutely.
 *
 * Done here rather than through the file list because a compile reaches files
 * the tree may not have loaded, and a name that cannot be shortened is still
 * worth showing — it is just not worth clicking.
 */
function relative(absolute: string, project: Project | null): string | null {
  if (!project) return null
  const root = project.path.replace(/\\/g, '/')
  const path = absolute.replace(/\\/g, '/')
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null
}
