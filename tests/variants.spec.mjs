/**
 * Variant integrity test: every prompt file mounted statically as a subagent
 * persona must exist and must not leak `${...}`/`{{...}}` template placeholders
 * into the model. Atlas files intentionally keep placeholders because the
 * driver renders them at assembly time; they are not static personas.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

test('agent composition persona paths exist', () => {
  const text = readFileSync(join(ROOT, 'presets/opencode-omo/agent.cordis.yml'), 'utf8')
  const paths = [...text.matchAll(/new URL\('([^']+)'/g)].map(match => match[1])
  assert.ok(paths.length >= 9)
  for (const path of paths) {
    assert.equal(existsSync(join(ROOT, 'presets/opencode-omo', path)), true, `missing persona file: ${path}`)
  }
})

test('static subagent personas contain no unresolved template placeholders', () => {
  const text = readFileSync(join(ROOT, 'presets/opencode-omo/agent.cordis.yml'), 'utf8')
  const paths = [...text.matchAll(/new URL\('([^']+)'/g)].map(match => match[1])
  for (const path of paths) {
    if (!path.includes('variants/')) continue
    const content = readFileSync(join(ROOT, 'presets/opencode-omo', path), 'utf8')
    const unresolved = content.match(/\$\{[A-Za-z0-9_()]+\}|\{\{[^}]+\}\}/g)
    assert.deepEqual(unresolved, null, `persona ${path} leaks placeholders`)
  }
})
