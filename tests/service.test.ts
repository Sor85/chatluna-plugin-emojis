import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config } from '../src/config'
import { EmojiKitchen } from '../src/service'
import { imageUrl, metadata } from './fixtures'

let directory: string
let lifetime: AbortController
const config = Config.parse({ autoUpdate: false, maxMetadataSize: 1 })
const response = () => new Response(JSON.stringify(metadata()), { headers: { etag: '"v1"', 'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT' } })

beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'emojis-test-')); lifetime = new AbortController() })
afterEach(async () => { lifetime.abort(); await rm(directory, { recursive: true, force: true }) })

function setup(fetcher: typeof fetch = vi.fn(async () => response()), options = config) {
  return new EmojiKitchen(options, fetcher, directory, lifetime.signal)
}

describe('metadata cache and lookup', () => {
  it('downloads, validates, persists, and returns one image', async () => {
    const kitchen = setup()
    expect(kitchen.mix('😀🔥')).toEqual({ kind: 'unavailable' })
    expect(await kitchen.update()).toEqual({ kind: 'updated' })
    expect(kitchen.status).toMatchObject({ ready: true, updating: false, emojiCount: 3, combinationCount: 2 })
    expect(kitchen.mix('😀🔥')).toMatchObject({ kind: 'found', image: { url: imageUrl } })
    expect(JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))).toMatchObject({ version: 1, etag: '"v1"', source: config.metadataUrl, metadata: { data: {} } })
    expect(await readdir(directory)).toEqual(['metadata.json'])
  })
  it('supports reverse lookup, variation selectors, and explicit misses', async () => {
    const kitchen = setup()
    await kitchen.update()
    expect(kitchen.mix('🔥😀')).toMatchObject({ kind: 'found', left: '🔥', right: '😀' })
    expect(kitchen.mix('❤🔥')).toMatchObject({ kind: 'found' })
    expect(kitchen.mix('❤️ + 🔥')).toMatchObject({ kind: 'found' })
    expect(kitchen.mix('🦄🦄')).toEqual({ kind: 'missing', left: '🦄', right: '🦄' })
    expect(kitchen.mix('')).toEqual({ kind: 'invalid', reason: 'empty' })
  })
  it('loads cached metadata before a failed network check', async () => {
    await setup().update()
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('offline') })
    const kitchen = setup(fetcher)
    await kitchen.initialize()
    expect(fetcher).not.toHaveBeenCalled()
    expect(kitchen.mix('😀🔥').kind).toBe('found')
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason: 'network' })
    expect(kitchen.status).toMatchObject({ ready: true, error: 'network' })
  })
  it('sends conditional headers and leaves the cache unchanged on 304', async () => {
    await setup().update()
    const before = await readFile(join(directory, 'metadata.json'))
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('if-none-match')).toBe('"v1"')
      expect(headers.get('if-modified-since')).toBe('Mon, 01 Jan 2024 00:00:00 GMT')
      return new Response(undefined, { status: 304 })
    })
    const kitchen = setup(fetcher)
    expect(await kitchen.update()).toEqual({ kind: 'unchanged' })
    expect(await readFile(join(directory, 'metadata.json'))).toEqual(before)
    expect(kitchen.status.error).toBeUndefined()
  })
  it('rejects 304 without a usable cache', async () => {
    const kitchen = setup(async () => new Response(undefined, { status: 304 }))
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason: 'invalid' })
    expect(kitchen.status.ready).toBe(false)
  })
  it('does not reuse validators or data after changing source', async () => {
    await setup().update()
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(new Headers(init?.headers).has('if-none-match')).toBe(false)
      return response()
    })
    const kitchen = setup(fetcher, { ...config, metadataUrl: 'https://example.com/metadata.json' })
    await kitchen.initialize()
    expect(kitchen.status.ready).toBe(false)
    expect(await kitchen.update()).toEqual({ kind: 'updated' })
    expect(kitchen.status.ready).toBe(true)
  })
  it('recovers from corrupt cache by downloading without validators', async () => {
    await writeFile(join(directory, 'metadata.json'), '{broken')
    const kitchen = setup(async (_url, init) => {
      expect(new Headers(init?.headers).has('if-none-match')).toBe(false)
      return response()
    })
    expect(await kitchen.update()).toEqual({ kind: 'updated' })
    expect(kitchen.status.error).toBeUndefined()
  })
  it('searches names, codepoints, and emoji with bounded pages', async () => {
    const kitchen = setup()
    await kitchen.update()
    for (const query of ['SMILE', '1f600', '😀']) {
      expect(kitchen.catalog({ query, page: 99 })).toMatchObject({ total: 1, page: 1, pages: 1, items: [{ emoji: '😀' }] })
    }
    expect(kitchen.catalog({ query: 'does not exist', page: 1 }).items).toEqual([])
  })
})

describe('update failure and lifecycle boundaries', () => {
  it.each([
    { body: '', status: 200, reason: 'invalid' },
    { body: '{broken', status: 200, reason: 'invalid' },
    { body: '{"data":{}}', status: 200, reason: 'invalid' },
    { body: JSON.stringify(metadata('http://127.0.0.1/secret.png')), status: 200, reason: 'invalid' },
    { body: 'unavailable', status: 503, reason: 'http' }
  ])('retains existing cache on $reason failure', async ({ body, status, reason }) => {
    await setup().update()
    const before = await readFile(join(directory, 'metadata.json'))
    const kitchen = setup(async () => new Response(body, { status }))
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason })
    expect(kitchen.mix('😀🔥').kind).toBe('found')
    expect(await readFile(join(directory, 'metadata.json'))).toEqual(before)
  })
  it('enforces Content-Length before reading', async () => {
    const cancel = vi.fn()
    const kitchen = setup(async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '1048577' } }))
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason: 'tooLarge' })
    expect(cancel).toHaveBeenCalled()
    expect(await readdir(directory)).toEqual([])
  })
  it('enforces the streamed size without Content-Length', async () => {
    const cancel = vi.fn()
    const kitchen = setup(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1048577)) }, cancel
    })))
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason: 'tooLarge' })
    expect(cancel).toHaveBeenCalled()
  })
  it('coalesces concurrent downloads and allows later retries', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response())
    const kitchen = setup(fetcher)
    const first = kitchen.update()
    expect(kitchen.update()).toBe(first)
    await first
    expect(fetcher).toHaveBeenCalledTimes(1)
    await kitchen.update()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('aborts in-flight requests and leaves no cache', async () => {
    let started: () => void = () => {}
    const ready = new Promise<void>((resolve) => { started = resolve })
    const kitchen = setup(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      started()
    }))
    const update = kitchen.update()
    await ready
    lifetime.abort()
    expect((await update).kind).toBe('failed')
    expect(await readdir(directory)).toEqual([])
  })
  it('reports timeouts separately', async () => {
    const kitchen = setup(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }), { ...config, timeout: 1000 })
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason: 'timeout' })
  })
  it('does not activate data that cannot be persisted', async () => {
    await mkdir(join(directory, 'metadata.json'))
    const kitchen = setup()
    expect(await kitchen.update()).toEqual({ kind: 'failed', reason: 'cache' })
    expect(kitchen.status.ready).toBe(false)
    expect(await readdir(directory)).toEqual(['metadata.json'])
  })
})
