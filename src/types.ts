export interface EmojiItem {
  id: string
  emoji: string
  name: string
  keywords: string[]
}

export interface Combination {
  url: string
  description: string
  date: string
}

export type InputError = 'empty' | 'count' | 'notEmoji'
export type UpdateError = 'network' | 'timeout' | 'http' | 'tooLarge' | 'invalid' | 'cache'

export type MixResult =
  | { kind: 'invalid'; reason: InputError }
  | { kind: 'unavailable' }
  | { kind: 'missing'; left: string; right: string }
  | { kind: 'found'; left: string; right: string; image: Combination }

export interface KitchenStatus {
  ready: boolean
  updating: boolean
  emojiCount: number
  combinationCount: number
  updatedAt?: string
  checkedAt?: string
  error?: UpdateError
}

export type UpdateResult = { kind: 'updated' | 'unchanged' } | { kind: 'failed'; reason: UpdateError }

export interface CatalogView {
  items: EmojiItem[]
  total: number
  page: number
  pages: number
}

export interface CatalogRequest {
  query: string
  page: number
}

export interface KitchenIndex {
  items: EmojiItem[]
  combinations: Map<string, Combination>
}

declare module '@chatluna/ui-client/client' {
  interface States {
    'emojis.status': KitchenStatus
    'emojis.catalog': CatalogView
  }
  interface Actions {
    'emojis.mix': (input: { input: string }) => MixResult
    'emojis.update': (input: Record<string, never>) => Promise<UpdateResult>
  }
}
