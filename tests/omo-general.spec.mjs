/**
 * General-tab source guards.
 *
 * The client General tab is typechecked and built, not DOM-tested; these
 * guards pin the required controls, the tab order, and the slot selector at
 * the source level.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(name) {
  return readFile(new URL(`../src/client/${name}`, import.meta.url), 'utf8')
}

test('GeneralSettings carries the required controls and default path', async () => {
  const text = await source('GeneralSettings.tsx')
  for (const required of ['Use omo.json', 'Re-Import', '~/.omo/omo.json']) {
    assert.ok(text.includes(required), `missing ${required}`)
  }
})

test('GeneralSettings reports import failures and ENOENT guidance', async () => {
  const text = await source('GeneralSettings.tsx')
  assert.ok(text.includes('Import failed'))
  assert.ok(text.includes('File not found'))
  assert.ok(text.includes('result.errors.some((item) => item.includes'))
})

test('OmoSettingsSection renders both tabs, General first and default-selected', async () => {
  const text = await source('OmoSettingsSection.tsx')
  const tabs = text.slice(text.indexOf('const TABS'))
  assert.ok(tabs.indexOf('General') < tabs.indexOf('角色设置'), 'General must come before 角色设置')
  assert.ok(text.includes("useState<TabId>('general')"), 'General must be the default-selected tab')
  assert.ok(text.includes('only:'), 'missing slot entry selector')
})

test('OmoSettingsSection degrades instead of blanking when the tab seat is missing', async () => {
  const text = await source('OmoSettingsSection.tsx')
  assert.ok(text.includes("typeof renderSlot === 'function'"), 'missing renderSlot guard')
})

test('the client entry registers the general tab before roles', async () => {
  const text = await source('index.ts')
  assert.ok(text.includes("id: 'general'"), 'general tab entry not registered')
  assert.ok(text.includes('GeneralSettings'), 'general tab component not referenced')
  assert.ok(text.includes('OMO_JSON_ENDPOINT'), 'omo-json endpoint constant missing')
  assert.ok(text.includes('OMO_JSON_IMPORT_ENDPOINT'), 'omo-json import endpoint constant missing')
  const generalOrder = text.indexOf("id: 'general'")
  const rolesOrder = text.indexOf("id: 'roles'")
  assert.ok(generalOrder > 0 && rolesOrder > 0)
  assert.ok(generalOrder < rolesOrder, 'general tab must register before roles')
})
