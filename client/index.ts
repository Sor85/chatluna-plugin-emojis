import type { Context } from 'cordis'
import type {} from '@chatluna/ui-client/client'
import type {} from '../src/types'
import zh from './locales/zh.yml'
import en from './locales/en.yml'

export default function apply(ctx: Context) {
  ctx.locale.register('emojis', { zh, en })
  ctx.slots.route({
    path: '/emojis',
    page: async () => (await import('./page')).EmojisPage,
    title: () => ctx.locale.translate('emojis', 'title'),
    icon: 'puzzle',
    group: 'capabilities',
    order: 66
  })
}
