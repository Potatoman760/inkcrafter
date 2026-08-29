import type { InkDiagnostic } from '../types'
import type { BundleManifest } from './manifest'

/**
 * What an export did, as the renderer needs to hear it.
 *
 * Lives in `shared` rather than beside the exporter because it crosses IPC, and
 * splits its bad news in two. A compile `error` means nothing was written and
 * the author has to fix the story; a `warning` means the bundle is there and
 * something in it will not look right. Collapsing them into one list would make
 * a missing sprite read like a failed build.
 */
export interface BundleExportResult {
  ok: boolean
  /** Absolute path of the directory written. */
  outDir: string
  manifest: BundleManifest | null
  /** Compile diagnostics. Any `error` here means nothing was written. */
  diagnostics: InkDiagnostic[]
  /** Non-fatal: a catalogued look with no file behind it, and so on. */
  warnings: string[]
}
