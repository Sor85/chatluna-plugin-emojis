#!/usr/bin/env node
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const endpoint = process.env.ONEBOT_SANDBOX_URL ?? 'http://127.0.0.1:61901'
const token = process.env.ONEBOT_SANDBOX_TOKEN
if (!token) throw new Error('缺少 ONEBOT_SANDBOX_TOKEN 环境变量')
const runId = `emojis-${randomUUID()}`
const bot = String(randomInt(810000000, 819000000))
const owner = String(Number(bot) + 1)
const user = String(Number(bot) + 2)
const group = String(Number(bot) + 3)
const results = []
let spaceId

async function call(name, input) {
  const response = await fetch(`${endpoint}/api/v1/tools/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, testRunId: runId }),
    signal: AbortSignal.timeout(135000)
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} ${body.code ?? ''} ${body.message ?? ''}`)
  return body
}

async function message(label, content, expected) {
  const sent = await call('send_message', {
    spaceId, operatorId: user, conversationId: `group:${group}`,
    content: `<at id="${bot}"/> ${content}`, idempotencyKey: `${runId}:${label}`
  })
  const received = await call('wait_for_message', {
    spaceId, cursor: sent.cursorBefore, authorId: bot, conversationId: `group:${group}`,
    settleSeconds: 1, timeoutSeconds: 60
  })
  assert.equal(received.outcome, 'matched', `${label} 没有收到机器人回复`)
  const messages = [...new Map((received.events ?? [received.event]).map((event) => [event.data.id, event.data])).values()]
  const images = messages.flatMap((item) => item.media ?? []).filter((media) => media.type === 'image')
  const text = messages.map((item) => item.content).join('\n')
  if (expected === 'image') {
    assert.equal(images.length, 1, `${label} 应返回且仅返回一张图片；实际文本：${text}`)
    assert.ok(images[0].mimeType.startsWith('image/'))
    assert.ok(images[0].size > 0)
  } else {
    assert.equal(images.length, 0, `${label} 不应返回图片`)
    assert.match(text, expected)
  }
  results.push({ label, command: content, passed: true, messageIds: messages.map((item) => item.id), images: images.length, text })
  console.log(`通过：${label}`)
}

try {
  await call('get_server_info', {})
  const space = await call('create_test_space', { name: 'Emoji 合成验收', idempotencyKey: `${runId}:space` })
  spaceId = space.spaceId
  assert.equal(typeof spaceId, 'string')
  console.log(`隔离测试空间：${spaceId}`)
  await call('apply_environment_changes', {
    spaceId, expectedRevision: space.revision, idempotencyKey: `${runId}:environment`,
    changes: [
      { action: 'create-bot', data: { id: bot, name: 'Emoji 验收机器人' } },
      { action: 'create-user', data: { id: owner, name: '测试群主' } },
      { action: 'create-user', data: { id: user, name: 'Emoji 测试成员' } },
      { action: 'create-group', data: { id: group, name: 'Emoji 隔离验收群', members: [
        { participantId: owner, role: 'owner' }, { participantId: user, role: 'member' }, { participantId: bot, role: 'member' }
      ] } }
    ]
  })
  await message('基础合成', 'emoji 😀🔥', 'image')
  await message('反向合成', 'emoji 🔥😀', 'image')
  await message('多码点表情', 'emoji ❤️🔥', 'image')
  await message('空格与加号', 'emoji 🐱 + 🐶', 'image')
  await message('缺少参数', 'emoji', /缺少两个/)
  await message('表情数量错误', 'emoji 😀🔥🐱', /恰好两个/)
  await message('非表情输入', 'emoji ab', /非 emoji/)
  await message('未收录组合', 'emoji 🇨🇳🇨🇳', /暂无/)
  await message('更新权限边界', 'emoji.update', /权限/)
  const debug = await call('list_onebot_debug_records', { spaceId, botId: bot, direction: 'action', limit: 50 })
  const report = { runId, spaceId, botId: bot, conversationId: `group:${group}`, passed: results.length, results, debug }
  if (process.env.EMOJIS_SANDBOX_REPORT) await writeFile(process.env.EMOJIS_SANDBOX_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(`沙盒验收通过：${results.length} 项`)
} finally {
  if (spaceId) {
    const complete = await call('complete_test_space', { spaceId, idempotencyKey: `${runId}:complete` })
    assert.equal(complete.status, 'completed')
    console.log(`测试空间已完成，机器人已停止：${spaceId}`)
  }
}
