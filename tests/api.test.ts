import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from 'cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config } from '../src/config'
import { registerCommands } from '../src/commands'
import { EmojiKitchen } from '../src/service'
import { metadata } from './fixtures'

type CommandAction = (argv: { session?: object }, input?: string) => unknown
type PrefixlessAction = (session: { execute: (input: string, capture: true) => Promise<string[]> }, params: [string, ...string[]]) => unknown

let directory: string
let kitchen: EmojiKitchen
let ctx: Context
let lifetime: AbortController
const commands = new Map<string, { action: CommandAction; authority: number }>()
const checkPermission = vi.fn(async () => false)
const match = vi.fn<(pattern: RegExp, action: PrefixlessAction, options: { appel: boolean; i18n: boolean; fuzzy: boolean }) => void>()

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'emojis-api-test-'))
  lifetime = new AbortController()
  kitchen = new EmojiKitchen(Config.parse({ autoUpdate: false }), async () => new Response(JSON.stringify(metadata())), directory, lifetime.signal)
  await kitchen.update()
  ctx = new Context()
  commands.clear()
  match.mockClear()
  Object.defineProperty(ctx, '$processor', { value: { match } })
  checkPermission.mockResolvedValue(false)
  // Minimal transport doubles: domain behavior and permission helpers remain real.
  Object.defineProperty(ctx, 'permissions', { value: { test: checkPermission } })
  Object.defineProperty(ctx, 'command', { value: (name: string, _description: string, options: { authority: number }) => {
    const command = {
      usage: (_usage: string) => command,
      action: (action: CommandAction) => { commands.set(name.split(' ')[0], { action, authority: options.authority }); return command }
    }
    return command
  } })
})
afterEach(async () => { lifetime.abort(); await rm(directory, { recursive: true, force: true }) })

function runCommand(name: string, input?: string, session?: object) {
  const command = commands.get(name)
  if (!command) throw new Error('Command not registered')
  return command.action({ session }, input)
}

describe('command bridge', () => {
  it('registers permission levels and returns a single image element', () => {
    registerCommands(ctx, kitchen, Config.parse({}))
    expect(commands.get('emoji')?.authority).toBe(1)
    expect(commands.get('emoji.update')?.authority).toBe(3)
    const result = String(runCommand('emoji', '😀🔥'))
    expect(result.match(/<img /g)).toHaveLength(1)
    expect(result).toContain('gstatic.com')
  })
  it('provides input and missing-combination messages', () => {
    registerCommands(ctx, kitchen, Config.parse({}))
    expect(runCommand('emoji')).toContain('缺少两个')
    expect(runCommand('emoji', '😀')).toContain('恰好两个')
    expect(runCommand('emoji', 'ab')).toContain('非 emoji')
    expect(runCommand('emoji', '🦄🦄')).toContain('暂无')
  })
  it('blocks manual updates even if a caller bypasses command authority metadata', async () => {
    registerCommands(ctx, kitchen, Config.parse({}))
    const update = vi.spyOn(kitchen, 'update')
    expect(await runCommand('emoji.update', undefined, {})).toContain('管理员权限')
    expect(update).not.toHaveBeenCalled()
    expect(checkPermission).toHaveBeenCalledWith('authority:3', {})
  })
  it('allows authorized manual updates', async () => {
    checkPermission.mockResolvedValue(true)
    registerCommands(ctx, kitchen, Config.parse({}))
    expect(await runCommand('emoji.update', undefined, {})).toBe('元数据更新成功。')
  })
})

describe('prefixless command registration', () => {
  it('does not register a matcher by default', () => {
    registerCommands(ctx, kitchen, Config.parse({}))
    expect(match).not.toHaveBeenCalled()
  })
  it('keeps an explicitly disabled matcher unregistered', () => {
    registerCommands(ctx, kitchen, Config.parse({ allowWithoutPrefix: false }))
    expect(match).not.toHaveBeenCalled()
  })
  it('executes the existing command once and captures its reply', async () => {
    registerCommands(ctx, kitchen, Config.parse({ allowWithoutPrefix: true }))
    expect(match).toHaveBeenCalledTimes(1)
    const [pattern, action, options] = match.mock.calls[0]
    expect(pattern.test('❤️ + 🔥')).toBe(true)
    expect(options).toEqual({ appel: false, i18n: false, fuzzy: false })
    const reply = [String(runCommand('emoji', '❤️ + 🔥'))]
    const execute = vi.fn(async () => reply)
    expect(await action({ execute }, ['❤️ + 🔥'])).toEqual(reply)
    expect(execute).toHaveBeenCalledExactlyOnceWith('emoji ❤️ + 🔥', true)
    expect(reply.join('').match(/<img /g)).toHaveLength(1)
  })
  it('preserves the command executor permission rejection', async () => {
    registerCommands(ctx, kitchen, Config.parse({ allowWithoutPrefix: true }))
    const execute = vi.fn(async () => ['权限不足'])
    expect(await match.mock.calls[0][1]({ execute }, ['😀🔥'])).toEqual(['权限不足'])
  })
})
