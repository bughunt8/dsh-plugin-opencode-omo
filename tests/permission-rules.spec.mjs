import test from 'node:test'
import assert from 'node:assert/strict'
import { doomLoopReason, externalDirectoryReason, outsideWorkspace, pathArgument } from '../presets/opencode-omo/permission-rules.mjs'

function exec(name, args, cwd = '/repo') {
  return { name, arguments: args, agent: { session: { header: { cwd } } } }
}

test('pathArgument reads the first path-bearing parameter', () => {
  assert.equal(pathArgument(exec('read', { file_path: '/repo/a.txt' })), '/repo/a.txt')
  assert.equal(pathArgument(exec('grep', { pattern: 'x', path: 'src' })), 'src')
  assert.equal(pathArgument(exec('bash', { command: 'ls' })), undefined)
})

test('outsideWorkspace detects absolute and parent-relative escapes', () => {
  assert.equal(outsideWorkspace('/repo/a.txt', '/repo'), false)
  assert.equal(outsideWorkspace('../outside.txt', '/repo'), true)
  assert.equal(outsideWorkspace('/etc/passwd', '/repo'), true)
  assert.equal(outsideWorkspace('src/a.txt', '/repo'), false)
})

test('externalDirectoryReason asks only for path-bearing outside accesses', () => {
  assert.match(externalDirectoryReason(exec('read', { file_path: '../secret' })), /requires approval/)
  assert.equal(externalDirectoryReason(exec('read', { file_path: 'src/a.txt' })), undefined)
  assert.equal(externalDirectoryReason(exec('bash', { command: 'cat /etc/passwd' })), undefined)
})

test('doomLoopReason asks on the third identical call inside the window', () => {
  const state = { key: undefined, count: 0, firstAt: 0, lastAt: 0 }
  const call = exec('write', { file_path: 'a.txt', content: 'x' })
  assert.equal(doomLoopReason(state, call, 1000), undefined)
  assert.equal(doomLoopReason(state, call, 2000), undefined)
  assert.match(doomLoopReason(state, call, 3000), /repeated 3 times/)
  assert.equal(doomLoopReason(state, call, 4000), undefined)
})

test('doomLoopReason resets after the window', () => {
  const state = { key: undefined, count: 0, firstAt: 0, lastAt: 0 }
  const call = exec('write', { file_path: 'a.txt', content: 'x' })
  doomLoopReason(state, call, 1000)
  doomLoopReason(state, call, 2000)
  assert.equal(doomLoopReason(state, call, 200_000), undefined)
})
