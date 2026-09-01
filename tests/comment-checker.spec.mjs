import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSlop } from '../presets/opencode-omo/comment-checker.mjs'

test('detectSlop rejects write comments with slop words', () => {
  assert.match(
    detectSlop('write', { content: 'const x = 1\n// this function handles login\n' }),
    /AI-slop comment rejected/,
  )
  assert.equal(detectSlop('write', { content: 'const x = 1\n// increment the retry budget\n' }), undefined)
})

test('detectSlop rejects edit slop on the opencode shim surface (newString)', () => {
  assert.match(
    detectSlop('edit', { filePath: '/tmp/a.ts', oldString: 'a', newString: '// obviously the right check\nreturn true' }),
    /AI-slop comment rejected/,
  )
})

test('detectSlop still rejects edit slop on native dsh names (new_string)', () => {
  assert.match(
    detectSlop('edit', { file_path: '/tmp/a.ts', old_string: 'a', new_string: '// clearly a cache\nreturn 1' }),
    /AI-slop comment rejected/,
  )
})

test('detectSlop prefers the shim newString when both names are present', () => {
  assert.match(
    detectSlop('edit', {
      newString: '// basically a wrapper\nreturn x',
      new_string: 'return x',
    }),
    /AI-slop comment rejected/,
  )
  assert.equal(
    detectSlop('edit', {
      newString: 'return x',
      new_string: '// basically a wrapper\nreturn x',
    }),
    undefined,
  )
})

test('detectSlop ignores non write/edit tools and clean replacements', () => {
  assert.equal(detectSlop('bash', { command: '// obviously' }), undefined)
  assert.equal(detectSlop('edit', { newString: 'return value' }), undefined)
  assert.equal(detectSlop('edit', {}), undefined)
})
