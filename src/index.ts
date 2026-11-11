import type { Context } from 'cordis'
import type {} from 'koishi'
import type {} from '@cordisjs/plugin-http'
import type {} from '@chatluna/permission'
import { httpFetch, resolveFromBaseUrl } from '@chatluna/utils'
import { Config } from './config'
import { EmojiKitchen } from './service'
import { registerCommands } from './commands'

export const name = 'chatluna-emojis'
export { Config }
export const inject = ['koishi', 'http', 'permissions']

export function apply(ctx: Context, config: Config) {
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort())
  const kitchen = new EmojiKitchen(config, httpFetch(ctx.http, { timeout: config.timeout }), resolveFromBaseUrl(ctx.baseUrl, config.dataDir), lifetime.signal)
  registerCommands(ctx, kitchen, config)
  const update = async () => {
    const result = await kitchen.update()
    if (result.kind === 'failed' && !lifetime.signal.aborted) ctx.logger.warn('Metadata update failed: %s', result.reason)
  }
  void update()
  if (config.autoUpdate) ctx.effect(() => {
    const timer = setInterval(() => void update(), config.updateInterval * 1000)
    timer.unref()
    return () => clearInterval(timer)
  })
}
