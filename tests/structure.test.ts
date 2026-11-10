import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const ignored = new Set(['node_modules', 'lib', 'dist', '.git', 'data', 'coverage'])

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid locale at ${prefix}`)
  return Object.entries(value).flatMap(([key, item]) => keys(item, prefix ? `${prefix}.${key}` : key)).sort()
}

describe('repository contracts', () => {
  it('registers all scoped instructions and only existing paths', () => {
    const instructions = readFileSync(join(root, 'AGENTS.md'), 'utf8')
    const declared = [...instructions.matchAll(/`([^`]+\/AGENTS\.md)`/g)].map((match) => match[1]).sort()
    const actual = files(root).filter((path) => path.endsWith('/AGENTS.md') && path !== join(root, 'AGENTS.md')).map((path) => relative(root, path)).sort()
    expect(declared).toEqual(actual)
    for (const path of declared) expect(existsSync(join(root, path))).toBe(true)
  })
  it('keeps Chinese and English locale keys in sync', () => {
    expect(keys(parse(readFileSync(join(root, 'client/locales/zh.yml'), 'utf8')))).toEqual(keys(parse(readFileSync(join(root, 'client/locales/en.yml'), 'utf8'))))
  })
  it('ships both faces without runtime data', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.files).toEqual(expect.arrayContaining(['src', 'client', 'lib', 'dist', 'README.md', 'LICENSE']))
    expect(pkg.files).not.toContain('data')
    expect(pkg.devDependencies['@chatluna/ui-client']).toBe('workspace:*')
    expect(pkg.cordis.service.required).toEqual(['koishi', 'http', 'permissions'])
  })
  it('keeps page typography explicit and leaves pointer/scroll styles to the host', () => {
    const sources = files(join(root, 'client')).filter((file) => /\.(tsx?|css)$/.test(file)).map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(sources).toContain('text-sm leading-6')
    expect(sources).not.toMatch(/cursor\s*:|cursor-|::-webkit-scrollbar|localStorage/)
  })
})
