import { Schema } from '@chatluna/schema'
import { combinationKey, normalizeCodepoint } from './utils'
import type { Combination, KitchenIndex } from './types'

const Unknown: Schema<unknown> = Schema.any()
const Codepoint = Schema.string().pattern(/^[a-f0-9]{1,6}(?:-[a-f0-9]{1,6})*$/i).max(128).required()
const ImageUrl = Schema.string().max(2048).checked((value) => {
  const url = new URL(value)
  if (url.origin !== 'https://www.gstatic.com' || url.username || url.password || url.search || url.hash ||
    !/^\/android\/keyboard\/emojikitchen\/[a-z0-9_/-]+\.png$/.test(url.pathname)) throw new Error('Unsupported Emoji Kitchen image URL')
}).required()
const Choice = Schema.object({
  gStaticUrl: ImageUrl,
  alt: Schema.string().max(2048).default(''),
  date: Schema.string().pattern(/^\d{8}$/).required(),
  isLatest: Schema.boolean().default(false)
})
const Entry = Schema.object({
  emoji: Schema.string().max(64).required(),
  emojiCodepoint: Codepoint,
  alt: Schema.string().max(256).default(''),
  keywords: Schema.array(Schema.string().max(128)).max(256).default([]),
  gBoardOrder: Schema.number().default(0),
  combinations: Schema.dict(Schema.array(Choice)).required()
})

export function buildIndex(raw: unknown): KitchenIndex {
  const root = Schema.object({ data: Schema.dict(Unknown).required() }).parse(raw)
  const ordered = []
  const combinations = new Map<string, Combination>()
  for (const [key, value] of Object.entries(root.data)) {
    const id = normalizeCodepoint(Codepoint.parse(key))
    const entry = Entry.parse(value)
    if (normalizeCodepoint(entry.emojiCodepoint) !== id) throw new Error('Mismatched emoji codepoint')
    ordered.push({ id, emoji: entry.emoji, name: entry.alt, keywords: entry.keywords, order: entry.gBoardOrder })
    for (const [other, choices] of Object.entries(entry.combinations)) {
      Codepoint.parse(other)
      const choice = choices.find((item) => item.isLatest) ?? choices[0]
      if (!choice) continue
      combinations.set(combinationKey(id, other), { url: choice.gStaticUrl, description: choice.alt, date: choice.date })
    }
  }
  if (!ordered.length || !combinations.size) throw new Error('Empty Emoji Kitchen metadata')
  if (new Set(ordered.map((item) => item.id)).size !== ordered.length) throw new Error('Duplicate emoji codepoint')
  return { items: ordered.sort((a, b) => a.order - b.order).map(({ order, ...item }) => item), combinations }
}
