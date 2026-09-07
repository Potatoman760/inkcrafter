import type { ComponentType } from 'react'
import type { MinigameDefinition, MinigameDocument } from '@shared/bundle/minigameDoc'
import type { MediaDocument } from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import type { StatsDocument } from '@shared/statsDoc'
import type { MinigamePanelProps } from './MinigamePanel'
import type { ArtHome, ArtOption } from './ArtField'

export type MinigameFieldsProps<T extends MinigameDefinition = MinigameDefinition> =
  MinigamePanelProps & {
    selected: T
    patch: (changes: Partial<MinigameDefinition>) => void
    numeric: (StatsDocument['stats'][number] | StatsDocument['variables'][number])[]
    textual: (StatsDocument['stats'][number] | StatsDocument['variables'][number])[]
    flags: string[]
    portraits: string[]
    minigameArt: MediaDocument['assets'][number] | null
    byPath: Map<string, MediaFile>
    backgrounds: ArtOption[]
    artwork: ArtOption[]
    characterArt: ArtOption[]
    homeOf: (game: MinigameDefinition) => ArtHome
  }

export interface MinigameEditor {
  kind: MinigameDefinition['kind']
  label: string
  order: number
  countAll?: boolean
  resultNote?: string
  customBackground?: boolean
  customTutorial?: boolean
  create: (count: number) => MinigameDefinition
  prepare?: (game: MinigameDefinition, media: MediaDocument) => MediaDocument
  remove?: (game: MinigameDefinition, doc: MinigameDocument, media: MediaDocument) => MediaDocument
  Fields: ComponentType<MinigameFieldsProps>
}
