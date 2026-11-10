import type { Context } from 'cordis'
import { Schema } from '@chatluna/schema'
import { requireActionLevel } from '@chatluna/ui-server'
import type { EmojiKitchen } from './service'
import type { CatalogRequest } from './types'

export function registerWebUI(ctx: Context, kitchen: EmojiKitchen) {
  ctx.chatluna_webui.addEntry({ baseUrl: import.meta.url, source: '../client/index.ts', bundle: '../dist/client.js' })
  ctx.chatluna_webui.state('emojis.status', { get: () => kitchen.status })
  ctx.chatluna_webui.state('emojis.catalog', {
    params: Schema.object({ query: Schema.string().max(128).default(''), page: Schema.number().min(1).max(10000).step(1).default(1) }),
    get: (input: CatalogRequest) => kitchen.catalog(input)
  })
  ctx.chatluna_webui.action('emojis.mix', {
    input: Schema.object({ input: Schema.string().max(128).required() })
  }, ({ input }) => kitchen.mix(input))
  ctx.chatluna_webui.action('emojis.update', { input: Schema.object({}).role('strict') }, async (_input, action) => {
    await requireActionLevel(ctx, action, 3)
    return kitchen.update()
  })
}
