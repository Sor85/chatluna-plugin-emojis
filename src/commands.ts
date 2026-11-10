import type { Context } from 'cordis'
import type {} from 'koishi'
import type {} from '@chatluna/permission'
import { h } from '@satorijs/core'
import type { Config } from './config'
import type { EmojiKitchen } from './service'
import type { UpdateError } from './types'
import { prefixlessPattern } from './utils'

const updateErrors: Record<UpdateError, string> = {
  network: '元数据下载失败，网络连接不可用。',
  timeout: '元数据下载超时。',
  http: '元数据服务器返回错误状态。',
  tooLarge: '元数据超过配置的大小上限。',
  invalid: '元数据格式或图片地址无效。',
  cache: '元数据缓存读写失败。'
}

export function registerCommands(ctx: Context, kitchen: EmojiKitchen, config: Config) {
  const owner = 'chatluna-plugin-emojis'
  ctx.command('emoji [emojis:text]', '合成两个 Emoji 表情', { owner, authority: 1 })
    .usage('emoji 😀🔥 或 emoji ❤️ + 🔥；可用组合由 Emoji Kitchen 决定。')
    .action((_argv, input = '') => {
      const result = kitchen.mix(input)
      if (result.kind === 'invalid') {
        if (result.reason === 'empty') return '缺少两个 emoji，示例：emoji 😀🔥。'
        if (result.reason === 'count') return '合成需要恰好两个 emoji，可连写或用空格、加号分隔。'
        return '输入包含非 emoji 字符，合成仅支持两个 emoji。'
      }
      if (result.kind === 'unavailable') return '元数据尚未就绪，管理员可通过 emoji.update 重试。'
      if (result.kind === 'missing') return h.escape(`暂无 ${result.left} 和 ${result.right} 的组合。`)
      return String(h.image(result.image.url))
    })
  if (config.allowWithoutPrefix) ctx.$processor.match(prefixlessPattern, (session, [input]) =>
    session.execute(`emoji ${input}`, true), { appel: false, i18n: false, fuzzy: false })
  ctx.command('emoji.update', '更新 Emoji Kitchen 元数据', { owner, authority: 3 })
    .action(async ({ session }) => {
      if (!session || !await ctx.permissions.test('authority:3', session)) return '更新元数据需要管理员权限（权限等级 3）。'
      const result = await kitchen.update()
      if (result.kind === 'failed') return `${updateErrors[result.reason]}${kitchen.status.ready ? '现有缓存仍可使用。' : '当前没有可用缓存。'}`
      return result.kind === 'updated' ? '元数据更新成功。' : '元数据未变更。'
    })
}
