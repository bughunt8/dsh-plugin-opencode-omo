/**
 * omo.json import parser + importer tests (English surface).
 *
 * The importer is a pure, dependency-injected function so the host routes,
 * the startup auto-import, and the CLI script all share one tested core.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { expandOmoPath, importOmoJson, parseOmoJson, readOmoJsonFile, OMO_JSON_DEFAULT_PATH, OMO_JSON_MAX_BYTES } from '../src/core/omo-json_en.ts'

const SAMPLE = JSON.stringify({
  sisyphus: {
    model: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' },
    fallbackModels: [],
  },
  oracle: {
    model: { provider: 'tokeness', model: 'gpt-5.5' },
    fallbackModels: [{ provider: 'tokeness', model: 'claude-opus-4-7' }],
    maxSteps: 12,
  },
})

test('default path is ~/.omo/omo.json', () => {
  assert.equal(OMO_JSON_DEFAULT_PATH, '~/.omo/omo.json')
})

test('expandOmoPath expands the home tilde', () => {
  const expanded = expandOmoPath('~/.omo/omo.json')
  assert.ok(!expanded.startsWith('~'))
  assert.ok(expanded.endsWith('/.omo/omo.json'))
  assert.equal(expandOmoPath('/abs/path.json'), '/abs/path.json')
})

test('parseOmoJson extracts every known role entry without errors', () => {
  const result = parseOmoJson(SAMPLE)
  assert.deepEqual(result.errors, [])
  assert.equal(result.entries.sisyphus.model.model, 'deepseek-v4-pro')
  assert.equal(result.entries.oracle.fallbackModels.length, 1)
  assert.equal(result.entries.oracle.maxSteps, 12)
})

test('parseOmoJson reports invalid JSON as an error', () => {
  const result = parseOmoJson('{ nope')
  assert.ok(result.errors.length > 0)
  assert.deepEqual(result.entries, {})
})

test('parseOmoJson reports a non-object root', () => {
  const result = parseOmoJson('[1,2,3]')
  assert.ok(result.errors.length > 0)
})

test('parseOmoJson collects unknown roles as errors and keeps the known ones', () => {
  const result = parseOmoJson(JSON.stringify({
    oracle: { model: { provider: 'tokeness', model: 'gpt-5.5' }, fallbackModels: [] },
    bogus: { model: { provider: 'x', model: 'y' }, fallbackModels: [] },
  }))
  assert.ok(result.errors.some((error) => error.includes('bogus')))
  assert.ok(result.entries.oracle !== undefined)
})

test('parseOmoJson collects malformed model shapes as per-role errors', () => {
  const result = parseOmoJson(JSON.stringify({
    momus: { model: { model: 'missing-provider' }, fallbackModels: [] },
    metis: { model: { provider: 'tokeness', model: 'gpt-5.5' }, fallbackModels: [] },
  }))
  assert.ok(result.errors.some((error) => error.includes('momus')))
  assert.ok(result.entries.metis !== undefined)
})

test('importOmoJson applies every parsed role through the registry', async () => {
  const applied = []
  const registry = {
    async setRoleConfig(role, config) { applied.push([role, config]) },
  }
  const result = await importOmoJson(async () => SAMPLE, registry, '~/.omo/omo.json')
  assert.equal(result.ok, true)
  assert.equal(result.imported, 2)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(applied.map(([role]) => role).sort(), ['oracle', 'sisyphus'])
})

test('importOmoJson is non-fatal on a missing file', async () => {
  const registry = { async setRoleConfig() { throw new Error('must not be called') } }
  const result = await importOmoJson(async () => {
    const error = new Error('ENOENT')
    error.code = 'ENOENT'
    throw error
  }, registry, '/nonexistent.json')
  assert.equal(result.ok, false)
  assert.equal(result.imported, 0)
  assert.ok(result.errors.length > 0)
})

test('importOmoJson still applies valid roles when one role fails validation', async () => {
  const applied = []
  const registry = { async setRoleConfig(role, config) { applied.push(role) } }
  const text = JSON.stringify({
    oracle: { model: { provider: 'tokeness', model: 'gpt-5.5' }, fallbackModels: [] },
    atlas: { model: { model: 'broken' }, fallbackModels: [] },
  })
  const result = await importOmoJson(async () => text, registry, 'x.json')
  assert.equal(result.ok, true)
  assert.equal(result.imported, 1)
  assert.ok(result.errors.some((error) => error.includes('atlas')))
  assert.deepEqual(applied, ['oracle'])
})

test('readOmoJsonFile returns the file text under the cap', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const dir = await mkdtemp(`${tmpdir()}/omo-read-`)
  const file = `${dir}/omo.json`
  await writeFile(file, '{"oracle":{}}')
  const text = await readOmoJsonFile(file)
  assert.equal(text, '{"oracle":{}}')
})

test('readOmoJsonFile refuses files over the import cap before reading', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const dir = await mkdtemp(`${tmpdir()}/omo-big-`)
  const file = `${dir}/big.json`
  await writeFile(file, 'x'.repeat(OMO_JSON_MAX_BYTES + 1))
  await assert.rejects(readOmoJsonFile(file), /import cap/)
})
