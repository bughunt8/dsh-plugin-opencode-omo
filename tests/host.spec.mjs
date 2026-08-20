/**
 * Host-side smoke tests for the opencode-omo role registry + HTTP surface.
 * Uses a bare in-memory settings provider and a route-recording webServer
 * mock, so no dsh profile is required.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { OMO_DEFAULT_ROLE, apply, detectDshCompat, inject, name, ROLE_ENDPOINT, ROLE_CONFIG_ENDPOINT } from '../lib/index.js'

class MemorySettings extends SettingsProvider {
  doc = {}
  get writable() { return true }
  load() { return Promise.resolve(structuredClone(this.doc)) }
  persist(ns, section) {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

class MockWebServer extends Service {
  routes = new Map()
  constructor(ctx) {
    super(ctx, 'webServer')
  }
  register(route) {
    this.routes.set(route.path, route.handler)
    return () => { this.routes.delete(route.path) }
  }
}

class MockLlm extends Service {
  constructor(ctx) {
    super(ctx, 'llm')
  }
  listProviders() {
    return [{ id: 'openai' }]
  }
  async listModels() {
    return [{ id: 'gpt-5.5' }, { id: 'deepseek-v4-flash' }]
  }
}

const settingsPlugin = {
  name: 'memory-settings',
  inject: [],
  apply(ctx) { ctx.plugin(MemorySettings) },
}

const webPlugin = {
  name: 'mock-web-server',
  inject: [],
  apply(ctx) { ctx.plugin(MockWebServer) },
}

const llmPlugin = {
  name: 'mock-llm',
  inject: [],
  apply(ctx) { ctx.plugin(MockLlm) },
}

async function boot() {
  const ctx = new Context()
  await ctx.plugin(settingsPlugin)
  await ctx.plugin(webPlugin)
  await ctx.plugin(llmPlugin)
  await ctx.plugin({ name, inject, apply })
  const web = ctx.get('webServer')
  assert.ok(web)
  return { ctx, web }
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Invoke a registered async route handler with a JSON body. */
async function call(web, path, body) {
  const req = new EventEmitter()
  req.method = body === undefined ? 'GET' : 'POST'
  req.url = body === undefined ? path : undefined
  let status = 200
  let payload = ''
  const res = new EventEmitter()
  res.writeHead = (code) => { status = code }
  res.end = (chunk) => { payload = typeof chunk === 'string' ? chunk : '' }
  const handler = web.routes.get(path)
  assert.equal(typeof handler, 'function')
  const promise = handler(req, res)
  if (body !== undefined) {
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  }
  await promise
  return { status, payload: JSON.parse(payload) }
}

test('registers the role registry and settings namespace', async () => {
  const { ctx } = await boot()
  const roles = ctx.omoRoles
  assert.equal(roles.roleFor('session-a'), OMO_DEFAULT_ROLE)
  assert.equal(roles.configs()['sisyphus'].fallbackModels.length, 0)
})

test('persists per-role model config and returns it through the registry', async () => {
  const { ctx } = await boot()
  await ctx.omoRoles.setRoleConfig('prometheus', {
    model: { provider: 'deepseek-official', model: 'deepseek-v4' },
    fallbackModels: [
      { provider: 'deepseek-official', model: 'deepseek-v3.2' },
      { provider: 'pi-ai', model: 'gpt-5.5' },
    ],
  })
  const config = ctx.omoRoles.configFor('prometheus')
  assert.deepEqual(config.model, { provider: 'deepseek-official', model: 'deepseek-v4' })
  assert.equal(config.fallbackModels.length, 2)
  assert.equal(ctx.omoRoles.configFor('sisyphus').fallbackModels.length, 0)
})

test('resolves omo-default primary and post-primary fallback chains', async () => {
  const { ctx } = await boot()
  await ctx.omoRoles.refreshDefaultFallbacks()
  const primary = ctx.omoRoles.primaryModelFor('hephaestus')
  assert.deepEqual(primary, { provider: 'openai', model: 'gpt-5.5' })
  // The omo default primary is also the first available chain entry, so the
  // effective fallback chain starts AFTER it (omo attachFallbackModels).
  assert.equal(ctx.omoRoles.fallbackModelsFor('hephaestus').length, 0)
})

test('explicit follow-session model keeps the session route', async () => {
  const { ctx } = await boot()
  await ctx.omoRoles.refreshDefaultFallbacks()
  await ctx.omoRoles.setRoleConfig('hephaestus', { model: null, fallbackModels: [] })
  assert.equal(ctx.omoRoles.primaryModelFor('hephaestus'), undefined)
  assert.equal(ctx.omoRoles.fallbackModelsFor('hephaestus').length, 0)
})

test('persists step budget and ultrawork override on a role config', async () => {
  const { ctx } = await boot()
  await ctx.omoRoles.setRoleConfig('sisyphus', {
    fallbackModels: [],
    maxSteps: 12,
    ultrawork: {
      model: { provider: 'openai', model: 'gpt-5.5', reasoningEffort: 'high' },
    },
  })
  const config = ctx.omoRoles.configFor('sisyphus')
  assert.equal(config.maxSteps, 12)
  assert.equal(config.ultrawork.model.provider, 'openai')
  assert.equal(config.ultrawork.model.reasoningEffort, 'high')
})

test('persists a session role and serves it through the role endpoint', async () => {
  const { ctx, web } = await boot()
  const response = await call(web, ROLE_ENDPOINT, { sessionId: 'session-a', role: 'atlas' })
  assert.equal(response.status, 200)
  assert.equal(response.payload.ok, true)
  assert.equal(response.payload.currentRole, 'atlas')
  assert.equal(ctx.omoRoles.roleFor('session-a'), 'atlas')
})

test('rejects unknown roles over HTTP', async () => {
  const { web } = await boot()
  const response = await call(web, ROLE_ENDPOINT, { sessionId: 'session-a', role: 'nope' })
  assert.equal(response.status, 400)
  assert.equal(response.payload.ok, false)
})

test('saves role config through the HTTP surface', async () => {
  const { ctx, web } = await boot()
  const response = await call(web, ROLE_CONFIG_ENDPOINT, {
    role: 'momus',
    model: null,
    fallbackModels: [{ provider: 'deepseek-official', model: 'deepseek-v4-flash' }],
  })
  assert.equal(response.status, 200)
  assert.equal(response.payload.config.fallbackModels.length, 1)
  assert.equal(ctx.omoRoles.configFor('momus').model, undefined)
})

test('rejects unknown roles through the registry', async () => {
  const { ctx } = await boot()
  await assert.rejects(ctx.omoRoles.setRole('session-a', 'unknown'))
  await assert.rejects(ctx.omoRoles.setRoleConfig('unknown', { fallbackModels: [] }))
})

test('dsh compat detection returns a stable supported/fallback snapshot', () => {
  const compat = detectDshCompat()
  assert.equal(typeof compat.assistantPrefill, 'boolean')
  assert.ok(['assistant-prefill', 'system-prompt-section', 'disabled'].includes(compat.maxStepsMode))
  assert.equal(Array.isArray(compat.warnings), true)
  assert.equal(typeof compat.detectionFailed, 'boolean')
})
