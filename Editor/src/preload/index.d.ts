import type { InkCrafterApi } from '@shared/types'

declare global {
  interface Window {
    inkcrafter: InkCrafterApi
  }
}

export {}
