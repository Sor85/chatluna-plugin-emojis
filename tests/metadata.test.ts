import { describe, expect, it } from 'vitest'
import { Config } from '../src/config'
import { buildIndex } from '../src/metadata'
import { combinationKey, emojiCodepoint, normalizeCodepoint, parsePair, prefixlessPattern } from '../src/utils'
import { imageUrl, metadata } from './fixtures'

describe('Unicode input', () => {
  it.each(['😀🔥', '😀 🔥', ' 😀 + 🔥 '])('parses two emoji: %s', (input) => {
    expect(parsePair(input)).toEqual({ left: '😀', right: '🔥' })
  })
  it.each(['❤️', '❤', '😶‍🌫️', '🙂‍↔️', '👨‍💻', '👍🏽', '🇨🇳', '1️⃣'])('preserves grapheme %s', (emoji) => {
    expect(parsePair(`${emoji}🔥`)).toEqual({ left: emoji, right: '🔥' })
  })
  it.each(['😀', '😀🔥🐱', ' + ', '😀'.repeat(100)])('rejects incorrect counts: %s', (input) => {
    expect(parsePair(input)).toEqual({ error: 'count' })
  })
  it.each(['ab', '😀a', '1😀', '<img src=x>🔥'])('rejects non-emoji: %s', (input) => {
    expect('error' in parsePair(input)).toBe(true)
  })
  it('distinguishes empty input', () => expect(parsePair('  ')).toEqual({ error: 'empty' }))
  it('only removes variation selectors from lookup IDs', () => {
    expect(emojiCodepoint('❤️')).toBe('2764')
    expect(emojiCodepoint('😶‍🌫️')).toBe('1f636-200d-1f32b')
    expect(emojiCodepoint('👍🏽')).toBe('1f44d-1f3fd')
    expect(normalizeCodepoint('2764-FE0F')).toBe('2764')
    expect(combinationKey('2764-fe0f', '1f525')).toBe('2764:1f525')
  })
})

describe('prefixless matching', () => {
  it.each(['😀🔥', ' 😀 🔥 ', '❤️ + 🔥', '😶‍🌫️🔥', '🙂‍↔️ 🔥', '👍🏽🔥', '🇨🇳🔥', '1️⃣🔥'])('matches complete two-emoji message %s', (input) => {
    expect(prefixlessPattern.test(input)).toBe(true)
    expect(parsePair(input)).not.toHaveProperty('error')
  })
  it.each(['', '😀', '👍🏽', '🇨🇳', '1️⃣', '❤️‍🔥', '😀🔥🐱', 'hello 😀🔥', '😀🔥 hello', 'emoji 😀🔥', '😀a', '<img src="x"/>😀🔥', '<at id="123"/>😀🔥', '😀 ++ 🔥'])('leaves unrelated messages alone: %s', (input) => {
    expect(prefixlessPattern.test(input)).toBe(false)
  })
})

describe('metadata validation', () => {
  it('selects the latest combination and builds a small catalog', () => {
    const index = buildIndex(metadata())
    expect(index.items.map((item) => item.emoji)).toEqual(['😀', '🔥', '❤️'])
    expect(index.combinations.get('1f600:1f525')).toEqual({ url: imageUrl, description: 'grinning-fire', date: '20201001' })
    expect(index.items[0]).not.toHaveProperty('combinations')
  })
  it('uses the first combination when no latest marker exists', () => {
    const raw = metadata()
    raw.data['1f600'].combinations['1f525'][1].isLatest = false
    expect(buildIndex(raw).combinations.get('1f600:1f525')?.description).toBe('old')
  })
  it.each(['http://www.gstatic.com/android/keyboard/emojikitchen/a.png', 'https://evil.test/x.png', 'file:///etc/passwd', 'data:image/png;base64,AAAA', 'https://www.gstatic.com/other.png', 'https://www.gstatic.com/android/keyboard/emojikitchen/a.svg', 'https://x@www.gstatic.com/android/keyboard/emojikitchen/a.png', `${imageUrl}?url=http://localhost`])('rejects unsafe image URL %s', (url) => {
    expect(() => buildIndex(metadata(url))).toThrow()
  })
  it.each([{}, { data: {} }, { data: { bad: {} } }, []])('rejects malformed or empty metadata', (raw) => {
    expect(() => buildIndex(raw)).toThrow()
  })
  it('requires image URLs after the Schema validation wrapper', () => {
    const raw = metadata()
    Reflect.deleteProperty(raw.data['1f600'].combinations['1f525'][0], 'gStaticUrl')
    expect(() => buildIndex(raw)).toThrow()
  })
  it('rejects mismatched entry IDs', () => {
    const raw = metadata()
    raw.data['1f600'].emojiCodepoint = '1f525'
    expect(() => buildIndex(raw)).toThrow('Mismatched')
  })
})

describe('configuration', () => {
  it('disables prefixless triggering by default and preserves explicit choices', () => {
    expect(Config.parse({}).allowWithoutPrefix).toBe(false)
    expect(Config.parse({ allowWithoutPrefix: false }).allowWithoutPrefix).toBe(false)
    expect(Config.parse({ allowWithoutPrefix: true }).allowWithoutPrefix).toBe(true)
  })
  it('keeps explicit false and supplies documented defaults', () => {
    expect(Config.parse({}).metadataUrl).toBe('https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json')
    expect(Config.parse({ autoUpdate: false })).toMatchObject({ autoUpdate: false, updateInterval: 86400, timeout: 30000, maxMetadataSize: 128, dataDir: 'data/chatluna/emojis' })
  })
  it.each([{ updateInterval: 10 }, { timeout: 10 }, { maxMetadataSize: 0 }, { metadataUrl: 'file:///tmp/metadata.json' }, { metadataUrl: 'https://user:pass@example.com/m.json' }])('rejects invalid configuration', (value) => {
    expect(Config.safeParse(value).success).toBe(false)
  })
  it('allows administrator-managed local metadata mirrors', () => {
    expect(Config.safeParse({ metadataUrl: 'http://192.168.1.5:8080/metadata.json' }).success).toBe(true)
  })
  it('labels every field on the schema the settings form renders', () => {
    const fields = Object.entries(Object.assign({}, ...Config.list!.map((group) => group.dict)) as Record<string, typeof Config>)
    expect(fields).toHaveLength(7)
    for (const [key, field] of fields) {
      const rendered = field.type === 'transform' ? field.inner! : field
      expect((rendered.meta as { label?: string }).label, key).toMatch(/\p{Script=Han}/u)
      expect(rendered.meta.description, key).toBeTruthy()
    }
  })
})
