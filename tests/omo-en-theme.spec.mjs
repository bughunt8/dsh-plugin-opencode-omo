/**
 * Design-token regression guard for the English settings components.
 *
 * The settings page must honor the host theme: every neutral color comes from
 * the shared dsw design tokens (`var(--dsw-alias-*`, `var(--dsw-surface)`)
 * with light-mode fallbacks — never from hardcoded dark-theme hex values.
 * Status colors (error/success) stay as literals by design. Pinned at the
 * source level because these colors are CSS-in-JS literals.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const DARK_NEUTRALS = ['#ffffff', '#e6e6e6', '#b3b3b3', '#d5d5d5', '#212121', '#2e2e2e', '#3f3f3f']

async function source(name) {
  return readFile(new URL(`../src/client/${name}`, import.meta.url), 'utf8')
}

test('settings components use shared dsw design tokens', async () => {
  for (const file of ['OmoSettingsSection_en.tsx', 'RoleSettings_en.tsx']) {
    const text = await source(file)
    assert.ok(text.includes('var(--dsw-alias-label-primary'), `${file} missing primary-label token`)
    assert.ok(text.includes('var(--dsw-alias-border'), `${file} missing border token`)
  }
})

test('settings components carry no hardcoded dark-theme neutrals', async () => {
  for (const file of ['OmoSettingsSection_en.tsx', 'RoleSettings_en.tsx']) {
    const text = await source(file)
    for (const literal of DARK_NEUTRALS) {
      assert.ok(!text.includes(literal), `${file} still contains hardcoded neutral ${literal}`)
    }
  }
})
