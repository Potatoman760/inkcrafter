import { describe, expect, it } from 'vitest'
import {
  parsePreviewCheckpoint,
  PREVIEW_CHECKPOINT_FORMAT,
  serialisePreviewCheckpoint,
  type PreviewCheckpoint
} from './preview'

const CHECKPOINT: PreviewCheckpoint = {
  format: PREVIEW_CHECKPOINT_FORMAT,
  id: 'preview-1',
  bundleId: 'prj_0000000000',
  contentHash: 'abc123',
  target: 'chapter.scene',
  inkState: '{"inkSaveVersion":10}'
}

describe('preview checkpoints', () => {
  it('round-trips the transient state exactly', () => {
    expect(parsePreviewCheckpoint(serialisePreviewCheckpoint(CHECKPOINT))).toEqual(CHECKPOINT)
  })

  it('refuses malformed and unsupported checkpoints', () => {
    expect(parsePreviewCheckpoint('not json')).toBeNull()
    expect(parsePreviewCheckpoint(JSON.stringify({ ...CHECKPOINT, format: 2 }))).toBeNull()
    expect(parsePreviewCheckpoint(JSON.stringify({ ...CHECKPOINT, inkState: null }))).toBeNull()
  })
})
