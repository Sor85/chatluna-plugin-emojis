import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Schema } from '@chatluna/schema'
import type { Config } from './config'
import { buildIndex } from './metadata'
import type { KitchenIndex, KitchenStatus, MixResult, UpdateError, UpdateResult } from './types'
import { combinationKey, emojiCodepoint, parsePair } from './utils'

const Unknown: Schema<unknown> = Schema.any()
const CacheHeader = Schema.object({
  version: Schema.const(1).required(),
  source: Schema.string().required(),
  etag: Schema.string().max(4096).optional(),
  lastModified: Schema.string().max(4096).optional(),
  updatedAt: Schema.string().required()
})

class UpdateFailure extends Error {
  constructor(readonly code: UpdateError) {
    super(code)
  }
}

export class EmojiKitchen {
  private index?: KitchenIndex
  private headers?: { source: string; etag?: string; lastModified?: string }
  private loading?: Promise<void>
  private updating?: Promise<UpdateResult>
  private updatedAt?: string
  private checkedAt?: string
  private error?: UpdateError
  private readonly maxBytes: number
  private readonly cacheFile: string

  constructor(
    private readonly config: Config,
    private readonly fetcher: typeof fetch,
    directory: string,
    private readonly signal: AbortSignal
  ) {
    this.maxBytes = config.maxMetadataSize * 1024 * 1024
    this.cacheFile = join(directory, 'metadata.json')
  }

  get status(): KitchenStatus {
    return {
      ready: this.index !== undefined,
      updating: this.updating !== undefined || this.loading === undefined,
      emojiCount: this.index?.items.length ?? 0,
      combinationCount: this.index?.combinations.size ?? 0,
      updatedAt: this.updatedAt,
      checkedAt: this.checkedAt,
      error: this.error
    }
  }

  initialize(): Promise<void> {
    return this.loading ??= this.loadCache()
  }

  private async loadCache(): Promise<void> {
    try {
      const info = await stat(this.cacheFile)
      if (info.size > this.maxBytes + 16384) throw new UpdateFailure('tooLarge')
      const raw: unknown = JSON.parse(await readFile(this.cacheFile, { encoding: 'utf8', signal: this.signal }))
      const header = CacheHeader.parse(raw)
      if (header.source !== this.config.metadataUrl) return
      const { metadata } = Schema.object({ metadata: Unknown.required() }).parse(raw)
      const index = buildIndex(metadata)
      this.signal.throwIfAborted()
      this.index = index
      this.headers = { source: header.source, etag: header.etag, lastModified: header.lastModified }
      this.updatedAt = header.updatedAt
    } catch (error) {
      if (this.signal.aborted) return
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) this.error = 'cache'
    }
  }

  mix(input: string): MixResult {
    const pair = parsePair(input)
    if ('error' in pair) return { kind: 'invalid', reason: pair.error }
    if (!this.index) return { kind: 'unavailable' }
    const left = emojiCodepoint(pair.left)
    const right = emojiCodepoint(pair.right)
    const image = this.index.combinations.get(combinationKey(left, right)) ?? this.index.combinations.get(combinationKey(right, left))
    return image ? { kind: 'found', ...pair, image } : { kind: 'missing', ...pair }
  }

  update(): Promise<UpdateResult> {
    if (this.updating) return this.updating
    this.updating = this.download().catch((error: unknown): UpdateResult => {
      const reason = error instanceof UpdateFailure ? error.code : 'network'
      if (!this.signal.aborted) this.error = reason
      return { kind: 'failed', reason }
    }).finally(() => {
      this.updating = undefined
    })
    return this.updating
  }

  private async download(): Promise<UpdateResult> {
    await this.initialize()
    this.signal.throwIfAborted()
    const headers = new Headers({ accept: 'application/json' })
    if (this.index && this.headers?.source === this.config.metadataUrl) {
      if (this.headers.etag) headers.set('if-none-match', this.headers.etag)
      if (this.headers.lastModified) headers.set('if-modified-since', this.headers.lastModified)
    }
    const timeout = AbortSignal.timeout(this.config.timeout)
    const signal = AbortSignal.any([this.signal, timeout])
    let body: Buffer
    let response: Response
    try {
      response = await this.fetcher(this.config.metadataUrl, { headers, signal })
      this.checkedAt = new Date().toISOString()
      if (response.status === 304) {
        if (!this.index || this.headers?.source !== this.config.metadataUrl) throw new UpdateFailure('invalid')
        this.error = undefined
        return { kind: 'unchanged' }
      }
      if (response.status !== 200) {
        await response.body?.cancel()
        throw new UpdateFailure('http')
      }
      if (Number(response.headers.get('content-length')) > this.maxBytes) {
        await response.body?.cancel()
        throw new UpdateFailure('tooLarge')
      }
      if (!response.body) throw new UpdateFailure('invalid')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          signal.throwIfAborted()
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > this.maxBytes) throw new UpdateFailure('tooLarge')
          chunks.push(chunk.value)
        }
      } finally {
        await reader.cancel()
        reader.releaseLock()
      }
      signal.throwIfAborted()
      body = Buffer.concat(chunks, size)
    } catch (error) {
      if (timeout.aborted && !this.signal.aborted) throw new UpdateFailure('timeout')
      throw error
    }

    let index: KitchenIndex
    try {
      const raw: unknown = JSON.parse(body.toString('utf8'))
      index = buildIndex(raw)
    } catch {
      throw new UpdateFailure('invalid')
    }
    this.signal.throwIfAborted()
    const header = {
      version: 1,
      source: this.config.metadataUrl,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
      updatedAt: new Date().toISOString()
    }
    CacheHeader.parse(header)
    const temporary = `${this.cacheFile}.${randomUUID()}.tmp`
    try {
      await mkdir(join(this.cacheFile, '..'), { recursive: true })
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(`${JSON.stringify(header).slice(0, -1)},"metadata":`)
        await file.writeFile(body)
        await file.writeFile('}')
        await file.sync()
      } finally {
        await file.close()
      }
      this.signal.throwIfAborted()
      await rename(temporary, this.cacheFile)
    } catch {
      throw new UpdateFailure('cache')
    } finally {
      await rm(temporary, { force: true })
    }
    this.index = index
    this.headers = header
    this.updatedAt = header.updatedAt
    this.error = undefined
    return { kind: 'updated' }
  }
}
