/**
 * Pure normalization tests for the opencode-omo settings section and the RPC
 * payload parsers. No dsh services are required.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeOmoSettingsSection,
  OMO_ROLE_SETTINGS_NAMESPACE,
} from '../src/core/omo-settings.ts'
import {
  OMO_RPC_CHANNEL,
  OMO_RPC_ENDPOINTS,
  parseOmoCatalogGetRequest,
  parseOmoRoleConfigSetRequest,
  parseOmoRoleSetRequest,
} from '../src/core/omo-rpc.ts'

test('settings namespace is the stable id', () => {
  assert.equal(OMO_ROLE_SETTINGS_NAMESPACE, 'opencode-omo-roles')
})

test('normalizeOmoSettingsSection reads stored role configs into the runtime shape', () => {
  const section = normalizeOmoSettingsSection({
    roles: {
      sisyphus: {
        model: { provider: 'openai', model: 'gpt-5.5', reasoningEffort: 'high' },
        fallbackModels: [{ provider: 'openai', model: 'gpt-5.4' }],
        maxSteps: 12,
        ultrawork: { model: { provider: 'openai', model: 'gpt-5.6' }, reasoningEffort: 'high' },
      },
      hephaestus: { model: null, fallbackModels: [] },
    },
    sessions: { 'session-a': 'atlas', 'session-b': 'unknown' },
  })
  assert.equal(section.roles['sisyphus'].model.provider, 'openai')
  assert.equal(section.roles['sisyphus'].fallbackModels.length, 1)
  assert.equal(section.roles['sisyphus'].maxSteps, 12)
  assert.equal(section.roles['sisyphus'].ultrawork.model.model, 'gpt-5.6')
  // model: null decodes to "follow session model" (model omitted).
  assert.equal(section.roles['hephaestus'].model, undefined)
  assert.deepEqual(section.roles['hephaestus'].fallbackModels, [])
  // Unknown session roles are dropped.
  assert.deepEqual(section.sessions, { 'session-a': 'atlas' })
})

test('normalizeOmoSettingsSection tolerates missing and malformed input', () => {
  assert.deepEqual(normalizeOmoSettingsSection(undefined), { roles: {}, sessions: {} })
  assert.deepEqual(normalizeOmoSettingsSection(null), { roles: {}, sessions: {} })
  assert.deepEqual(normalizeOmoSettingsSection({ roles: { unknown: {} } }), { roles: {}, sessions: {} })
  const section = normalizeOmoSettingsSection({
    roles: { sisyphus: { model: { provider: '', model: '' }, fallbackModels: 'bad' } },
    sessions: { a: 'bad-role' },
  })
  assert.equal(section.roles['sisyphus'].model, undefined)
  assert.deepEqual(section.roles['sisyphus'].fallbackModels, [])
  assert.deepEqual(section.sessions, {})
})

test('rpc channel is a single-segment logical channel', () => {
  assert.equal(OMO_RPC_CHANNEL, '/opencode-omo')
  assert.match(OMO_RPC_CHANNEL, /^\/[A-Za-z0-9._~-]+$/)
})

test('rpc endpoints are stable', () => {
  assert.equal(OMO_RPC_ENDPOINTS.catalogGet, 'catalog/get')
  assert.equal(OMO_RPC_ENDPOINTS.roleSet, 'role/set')
  assert.equal(OMO_RPC_ENDPOINTS.roleConfigSet, 'role-config/set')
})

test('parseOmoCatalogGetRequest accepts empty and sessionId payloads', () => {
  assert.deepEqual(parseOmoCatalogGetRequest({}), {})
  assert.deepEqual(parseOmoCatalogGetRequest({ sessionId: 'session-a' }), { sessionId: 'session-a' })
  assert.equal(parseOmoCatalogGetRequest({ sessionId: '' }), undefined)
  assert.equal(parseOmoCatalogGetRequest('bad'), undefined)
})

test('parseOmoRoleSetRequest validates the role', () => {
  assert.deepEqual(
    parseOmoRoleSetRequest({ sessionId: 'session-a', role: 'atlas' }),
    { sessionId: 'session-a', role: 'atlas' },
  )
  assert.equal(parseOmoRoleSetRequest({ sessionId: 'session-a', role: 'nope' }), undefined)
  assert.equal(parseOmoRoleSetRequest({ sessionId: '', role: 'atlas' }), undefined)
})

test('parseOmoRoleConfigSetRequest validates the shape', () => {
  assert.deepEqual(
    parseOmoRoleConfigSetRequest({ role: 'momus', config: { fallbackModels: [] } }),
    { role: 'momus', config: { fallbackModels: [] } },
  )
  assert.equal(parseOmoRoleConfigSetRequest({ role: 'nope', config: {} }), undefined)
  assert.equal(parseOmoRoleConfigSetRequest({ role: 'momus', config: 'bad' }), undefined)
  assert.equal(parseOmoRoleConfigSetRequest({ role: 'momus', config: null }), undefined)
})
