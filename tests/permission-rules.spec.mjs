import test from 'node:test'
import assert from 'node:assert/strict'
import { doomLoopReason, externalDirectoryReason, isDelegatedSession, outsideWorkspace, pathArgument, settleAsk } from '../presets/opencode-omo/permission-rules.mjs'

function exec(name, args, cwd = '/repo', header = {}) {
  return { name, arguments: args, agent: { session: { header: { cwd, ...header } } } }
}

test('pathArgument reads the first path-bearing parameter', () => {
  assert.equal(pathArgument(exec('read', { file_path: '/repo/a.txt' })), '/repo/a.txt')
  assert.equal(pathArgument(exec('grep', { pattern: 'x', path: 'src' })), 'src')
  assert.equal(pathArgument(exec('bash', { command: 'ls' })), undefined)
  assert.equal(pathArgument(exec('lsp_goto_definition', { filePath: '/repo/a.ts' })), '/repo/a.ts')
  assert.equal(pathArgument(exec('lsp_find_references', { file_path: 'src/a.ts' })), 'src/a.ts')
})

test('pathArgument covers the camelCase shim surface for read/write/edit', () => {
  // The tool-surface shims re-register read/write/edit with opencode's
  // camelCase `filePath` schema; pre-execute sees those arguments verbatim.
  assert.equal(pathArgument(exec('read', { filePath: '/repo/a.txt' })), '/repo/a.txt')
  assert.equal(pathArgument(exec('write', { filePath: '/repo/a.txt', content: 'x' })), '/repo/a.txt')
  assert.equal(pathArgument(exec('edit', { filePath: '/repo/a.txt', oldString: 'a', newString: 'b' })), '/repo/a.txt')
})

test('outsideWorkspace detects absolute and parent-relative escapes', () => {
  assert.equal(outsideWorkspace('/repo/a.txt', '/repo'), false)
  assert.equal(outsideWorkspace('../outside.txt', '/repo'), true)
  assert.equal(outsideWorkspace('/etc/passwd', '/repo'), true)
  assert.equal(outsideWorkspace('src/a.txt', '/repo'), false)
})

test('externalDirectoryReason asks only for path-bearing outside accesses', () => {
  assert.match(externalDirectoryReason(exec('read', { file_path: '../secret' })), /requires approval/)
  assert.match(externalDirectoryReason(exec('read', { filePath: '../secret' })), /requires approval/)
  assert.match(externalDirectoryReason(exec('write', { filePath: '/etc/x', content: 'y' })), /requires approval/)
  assert.match(externalDirectoryReason(exec('edit', { filePath: '/etc/x', oldString: 'a', newString: 'b' })), /requires approval/)
  assert.equal(externalDirectoryReason(exec('read', { file_path: 'src/a.txt' })), undefined)
  assert.equal(externalDirectoryReason(exec('read', { filePath: 'src/a.txt' })), undefined)
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

test('isDelegatedSession is true for origin=subagent or depth >= 1', () => {
  assert.equal(isDelegatedSession(exec('read', { file_path: 'a' })), false)
  assert.equal(isDelegatedSession(exec('read', { file_path: 'a' }, '/repo', { origin: 'subagent' })), true)
  assert.equal(isDelegatedSession(exec('read', { file_path: 'a' }, '/repo', { delegationDepth: 1 })), true)
  assert.equal(isDelegatedSession(exec('read', { file_path: 'a' }, '/repo', { delegationDepth: 0 })), false)
})

test('settleAsk keeps ask in the parent and denies in a child', () => {
  const reason = 'opencode-omo: "read" would access a path outside the workspace root and requires approval (opencode external_directory: ask)'
  const parent = settleAsk(exec('read', { filePath: '../secret' }), reason)
  assert.deepEqual(parent, { kind: 'ask', reason })
  const child = settleAsk(exec('read', { filePath: '../secret' }, '/repo', { origin: 'subagent' }), reason)
  assert.equal(child.kind, 'deny')
  assert.match(child.reason, /outside the workspace root/)
  assert.match(child.reason, /delegated session cannot escalate/)
  assert.doesNotMatch(child.reason, /requires approval/)
  assert.doesNotMatch(child.reason, /report the limitation/)
})
