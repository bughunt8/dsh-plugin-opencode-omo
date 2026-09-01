/**
 * Variant integrity + routing: static subagent personas must exist without
 * leaking `${...}`/`{{...}}` placeholders. Atlas/hephaestus/specialist files
 * are extracted from oh-my-openagent v5.0.0-beta.31 and routed the same way
 * as omo's factories (`atlasPromptVariants`, `getHephaestusPromptSource`,
 * createOracle/Metis/Momus).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atlasVariantFile, hephaestusVariantFile, specialistVariantFile } from '../presets/opencode-omo/driver.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const VARIANT_DIR = join(ROOT, 'presets/opencode-omo/roles/prompts/variants')

function collectVariantMarkdown(subdir) {
  return readdirSync(join(VARIANT_DIR, subdir))
    .filter(name => name.endsWith('.md'))
    .map(name => ({ path: join(VARIANT_DIR, subdir, name), text: readFileSync(join(VARIANT_DIR, subdir, name), 'utf8') }))
}

test('named subagent rows do not overlay a static persona', () => {
  // A persona overlay shadows the driver's complete `<env>` + specialist
  // section and restores the dsh harness identity. Role is pinned at spawn.
  const text = readFileSync(join(ROOT, 'presets/opencode-omo/agent.cordis.yml'), 'utf8')
  assert.doesNotMatch(text, /^\s+persona:/m)
  assert.equal(existsSync(join(VARIANT_DIR, 'specialists/oracle-default.md')), true)
  assert.equal(existsSync(join(VARIANT_DIR, 'specialists/explore.md')), true)
})

test('pre-rendered specialist files contain no unresolved template placeholders', () => {
  // `specialists/*.md` are templates; the driver substitutes `${…}` at
  // assembly. `rendered/` is the baked copy that must stay literal.
  for (const { path, text } of collectVariantMarkdown('rendered')) {
    const unresolved = text.match(/\$\{[A-Za-z0-9_()]+\}|\{\{[^}]+\}\}/g)
    assert.deepEqual(unresolved, null, `${path} leaks placeholders`)
  }
})

test('atlas/hephaestus/specialist prompts do not teach missing tool names', () => {
  for (const { path, text } of [
    ...collectVariantMarkdown('atlas'),
    ...collectVariantMarkdown('hephaestus'),
    ...collectVariantMarkdown('specialists'),
    ...collectVariantMarkdown('rendered'),
  ]) {
    assert.doesNotMatch(text, /interactive_bash/, path)
    assert.doesNotMatch(text, /codegraph_/, path)
    assert.doesNotMatch(text, /LspDiagnostics/, path)
  }
})

test('atlasVariantFile matches omo atlasPromptVariants order', () => {
  assert.equal(atlasVariantFile('anthropic/claude-opus-4-7'), 'atlas/opus-4-7.md')
  assert.equal(atlasVariantFile('github-copilot/claude-opus-4.7'), 'atlas/opus-4-7.md')
  assert.equal(atlasVariantFile('anthropic/claude-opus-4-6'), 'atlas/default.md')
  assert.equal(atlasVariantFile('anthropic/claude-sonnet-4-6'), 'atlas/default.md')
  assert.equal(atlasVariantFile('anthropic/claude-haiku-4-5'), 'atlas/default.md')
  assert.equal(atlasVariantFile('openai/gpt-5.5'), 'atlas/gpt.md')
  assert.equal(atlasVariantFile('openai/gpt-claude-something'), 'atlas/gpt.md')
  assert.equal(atlasVariantFile('google/gemini-3.1-pro'), 'atlas/gemini.md')
  assert.equal(atlasVariantFile('github-copilot/gemini-2.0-pro'), 'atlas/gemini.md')
  assert.equal(atlasVariantFile('opencode-go/kimi-k3'), 'atlas/kimi-k3.md')
  assert.equal(atlasVariantFile('kimi-for-coding/k3p1'), 'atlas/kimi-k3.md')
  assert.equal(atlasVariantFile('opencode-go/kimi-k2.7'), 'atlas/kimi-k2-7.md')
  assert.equal(atlasVariantFile('kimi-for-coding/k2p7'), 'atlas/kimi-k2-7.md')
  assert.equal(atlasVariantFile('moonshotai/kimi-k2.6'), 'atlas/kimi.md')
  assert.equal(atlasVariantFile('kimi-for-coding/k2p6'), 'atlas/kimi.md')
  assert.equal(atlasVariantFile('zai/glm-5.2'), 'atlas/glm.md')
  assert.equal(atlasVariantFile('opencode-go/big-pickle'), 'atlas/default.md')
  assert.equal(atlasVariantFile(undefined), 'atlas/default.md')
})

test('hephaestusVariantFile matches omo getHephaestusPromptSource', () => {
  assert.equal(hephaestusVariantFile('openai/gpt-5.6-sol'), 'hephaestus/gpt-5-6.md')
  assert.equal(hephaestusVariantFile('gpt-5-6'), 'hephaestus/gpt-5-6.md')
  assert.equal(hephaestusVariantFile('openai/gpt-5.5'), 'hephaestus/gpt-5-5.md')
  assert.equal(hephaestusVariantFile('gpt-5-5'), 'hephaestus/gpt-5-5.md')
  assert.equal(hephaestusVariantFile('openai/gpt-5.4'), 'hephaestus/gpt-5-4.md')
  assert.equal(hephaestusVariantFile('gpt-5-4'), 'hephaestus/gpt-5-4.md')
  assert.equal(hephaestusVariantFile('openai/gpt-5.3-codex'), 'hephaestus/gpt.md')
  assert.equal(hephaestusVariantFile('claude-sonnet-4-6'), undefined)
})

test('specialistVariantFile matches omo oracle/metis/momus factories', () => {
  assert.equal(specialistVariantFile('oracle', 'gpt-5.6'), 'specialists/oracle-gpt-5-5.md')
  assert.equal(specialistVariantFile('oracle', 'gpt-5-5'), 'specialists/oracle-gpt-5-5.md')
  assert.equal(specialistVariantFile('oracle', 'gpt-5.4'), 'specialists/oracle-gpt.md')
  assert.equal(specialistVariantFile('oracle', 'claude-sonnet-4-6'), 'specialists/oracle-default.md')
  assert.equal(specialistVariantFile('metis', 'kimi-k2.7'), 'specialists/metis-kimi-k2-7.md')
  assert.equal(specialistVariantFile('metis', 'kimi-k2-7'), 'specialists/metis-kimi-k2-7.md')
  assert.equal(specialistVariantFile('metis', 'kimi-for-coding/k2p7'), 'specialists/metis-kimi-k2-7.md')
  assert.equal(specialistVariantFile('metis', 'kimi-k3'), 'specialists/metis-default.md')
  assert.equal(specialistVariantFile('momus', 'gpt-5.6'), 'specialists/momus-gpt-5-6.md')
  assert.equal(specialistVariantFile('momus', 'gpt-5-6'), 'specialists/momus-gpt-5-6.md')
  assert.equal(specialistVariantFile('momus', 'gpt-5.5'), 'specialists/momus-gpt.md')
  assert.equal(specialistVariantFile('momus', 'claude-opus-4-7'), 'specialists/momus-default.md')
})
