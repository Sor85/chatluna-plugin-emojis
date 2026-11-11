#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, watch, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const host = resolve(process.env.CHATLUNA_V2_ROOT ?? join(source, '../../chatluna-v2-mirror'))
const target = join(host, 'external/emojis')
const ignored = new Set(['.git', '.claude', 'node_modules', 'lib', 'dist', 'data', 'coverage', '.DS_Store', '.playwright-cli', '.playwright-mcp'])
const skip = (name) => name.split(sep).some((part) => ignored.has(part) || part.startsWith('.env')) || name.endsWith('.tsbuildinfo')
const inside = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) }

if (!existsSync(join(host, 'package.json')) || !existsSync(join(host, 'AGENTS.md'))) throw new Error(`未找到 ChatLuna v2 宿主：${host}`)
if (inside(source, target) || inside(target, source)) throw new Error('同步目录与源码重叠')
for (const path of [join(host, 'external'), target]) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`同步目标不能是符号链接：${path}`)
}
mkdirSync(target, { recursive: true })
if (inside(realpathSync(source), realpathSync(target)) || inside(realpathSync(target), realpathSync(source))) throw new Error('同步目录与源码重叠')
const manifest = join(target, '.emojis-sync.json')

function sync() {
  const files = []
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const name = relative(source, path)
      if (skip(name)) continue
      if (entry.isSymbolicLink()) throw new Error(`源码中存在符号链接：${name}`)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(name)
    }
  }
  walk(source)
  const previous = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : []
  if (!Array.isArray(previous) || previous.some((name) => typeof name !== 'string' || !inside(target, resolve(target, name)) || skip(name))) throw new Error('同步清单无效')
  let copied = 0
  for (const name of files) {
    const output = join(target, name)
    for (let path = output; path !== target; path = dirname(path)) {
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`同步目标包含符号链接：${path}`)
    }
    const content = readFileSync(join(source, name))
    if (existsSync(output) && readFileSync(output).equals(content)) continue
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, content)
    copied++
  }
  let removed = 0
  for (const name of previous) {
    if (files.includes(name)) continue
    const output = join(target, name)
    if (!existsSync(output)) continue
    if (!inside(realpathSync(target), realpathSync(output))) throw new Error('同步清理目标越界')
    rmSync(output)
    removed++
    // 删除源码目录后，副本中只剩空目录，结构守卫会把它当成仍存在的源码目录。
    for (let path = dirname(output); path !== target && readdirSync(path).length === 0; path = dirname(path)) rmSync(path, { recursive: true })
  }
  writeFileSync(manifest, JSON.stringify(files, null, 2))
  console.log(`同步完成：复制 ${copied}，删除 ${removed} → ${target}`)
}

sync()
if (!process.argv.includes('--once')) {
  let timer
  watch(source, { recursive: true }, (_event, filename) => {
    if (filename && skip(String(filename))) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      try { sync() } catch (error) { console.error('同步失败：', error) }
    }, 150)
  })
  console.log(`监听源码：${source}`)
}
