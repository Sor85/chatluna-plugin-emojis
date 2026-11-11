import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const ignored = new Set(['node_modules', 'lib', 'dist', '.git', 'data', 'coverage'])

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

describe('repository contracts', () => {
  it('registers all scoped instructions and only existing paths', () => {
    const instructions = readFileSync(join(root, 'AGENTS.md'), 'utf8')
    const declared = [...instructions.matchAll(/`([^`]+\/AGENTS\.md)`/g)].map((match) => match[1]).sort()
    const actual = files(root).filter((path) => path.endsWith('/AGENTS.md') && path !== join(root, 'AGENTS.md')).map((path) => relative(root, path)).sort()
    expect(declared).toEqual(actual)
    for (const path of declared) expect(existsSync(join(root, path))).toBe(true)
  })
  it('ships the server entry without runtime data or a client page', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.files).toEqual(expect.arrayContaining(['src', 'lib', 'README.md', 'LICENSE']))
    expect(pkg.files).not.toContain('data')
    expect(existsSync(join(root, 'client'))).toBe(false)
    expect(Object.keys(pkg.devDependencies).filter((name) => name.startsWith('@chatluna/ui-'))).toEqual([])
    expect(pkg.cordis.service.required).toEqual(['koishi', 'http', 'permissions'])
  })
})
