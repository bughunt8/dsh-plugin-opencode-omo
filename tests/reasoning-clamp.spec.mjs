/**
 * reasoningEffort capability handling: the agent/request route must clamp a
 * requested effort to the model's advertised set, drop it when the model
 * advertises no reasoning at all, and advance the fallback chain when an
 * unsupported-effort failure still slips through. Also covers the ultrawork
 * read-side sanitize and partial-POST preservation on the host surface.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { apply, clampReasoningEffort, fallbackRetryable } from '../presets/opencode-omo/driver.mjs'
import { apply as hostApply, inject as hostInject, name as hostName, sanitizeUltrawork, ROLE_CONFIG_ENDPOINT } from '../lib/index.js'

/* ── clampReasoningEffort (pure) ─────────────────────────────────────────── */

test('unsupported effort clamps down to the highest supported level', () => {
  const decision = clampReasoningEffort('max', {
    efforts: [{ id: 'off', name: 'Off' }, { id: 'medium', name: 'Medium' }],
  })
  assert.equal(decision.effort, 'medium')
  assert.equal(decision.original, 'max')
  assert.equal(decision.clamped, 'max')
})

test('a model that only supports off clamps every non-off request to off', () => {
  for (const requested of ['low', 'medium', 'high', 'max']) {
    const decision = clampReasoningEffort(requested, { efforts: [{ id: 'off' }] })
    assert.equal(decision.effort, 'off')
    assert.equal(decision.clamped, requested)
  }
})

test('supported effort passes through unchanged', () => {
  const decision = clampReasoningEffort('high', {
    efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }],
    defaultEffort: 'off',
  })
  assert.equal(decision.effort, 'high')
  assert.equal(decision.clamped, undefined)
})

test('unknown capability forwards the request unchanged', () => {
  assert.equal(clampReasoningEffort('high', undefined).effort, 'high')
  assert.equal(clampReasoningEffort('high', undefined).clamped, undefined)
  assert.equal(clampReasoningEffort('high', null).effort, 'high')
  assert.equal(clampReasoningEffort('high', {}).effort, 'high')
  assert.equal(clampReasoningEffort('high', { efforts: [] }).effort, 'high')
})

test('no requested effort is a passthrough', () => {
  const decision = clampReasoningEffort(undefined, { efforts: [{ id: 'off' }] })
  assert.equal(decision.effort, undefined)
  assert.equal(decision.clamped, undefined)
})

test('clamping never escalates above the requested level', () => {
  const decision = clampReasoningEffort('medium', {
    efforts: [{ id: 'off' }, { id: 'high' }],
  })
  assert.equal(decision.effort, 'off')
})

test('requested effort below every supported level clamps to the least capable level', () => {
  const decision = clampReasoningEffort('off', {
    efforts: [{ id: 'medium' }, { id: 'high' }],
  })
  assert.equal(decision.effort, 'medium')
})

test('unknown-rank supported ids clamp to the last adapter-listed entry', () => {
  const decision = clampReasoningEffort('x-turbo', {
    efforts: [{ id: 'alpha' }, { id: 'beta' }],
  })
  assert.equal(decision.effort, 'beta')
  assert.equal(decision.clamped, 'x-turbo')
})

/* ── fallback classification ─────────────────────────────────────────────── */

test('capability-mismatch failure codes advance the fallback chain', () => {
  assert.equal(fallbackRetryable({ code: 'UNSUPPORTED_REASONING_EFFORT' }), true)
  assert.equal(fallbackRetryable({ code: 'INVALID_MODEL_REASONING' }), true)
  assert.equal(fallbackRetryable({ code: 'CONTENT_POLICY' }), false)
  assert.equal(fallbackRetryable(undefined), false)
})

/* ── agent/request wiring through the live llm capability ────────────────── */

function driverCtx(omoRoles, llm) {
  const handlers = new Map()
  const ctx = {
    get: service => {
      if (service === 'omoRoles') return omoRoles
      if (service === 'llm') return llm
      throw new Error(`no service ${service}`)
    },
    systemPrompt: { section: () => {}, variable: () => {}, suppressRuntimeContext: () => {} },
    effect: fn => { fn(); return () => {} },
    on: (event, handler) => { handlers.set(event, handler) },
  }
  apply(ctx)
  return handlers
}

function roleFace(role = 'sisyphus', config = { fallbackModels: [] }) {
  return {
    roleFor: () => role,
    configFor: () => config,
    fallbackModelsFor: () => [],
    primaryModelFor: () => undefined,
  }
}

const baseAgent = { session: { id: 'sess-clamp' }, options: { provider: 'deepseek-official', model: 'gpt-5.5' } }

test('agent/request clamps effort via llm.resolveModelInfo', async () => {
  const resolveCalls = []
  const llm = {
    resolveModelInfo: async (provider, model) => {
      resolveCalls.push([provider, model])
      return { reasoning: { efforts: [{ id: 'off' }, { id: 'low' }] } }
    },
  }
  const handlers = driverCtx(roleFace(), llm)
  const handler = handlers.get('agent/request')
  assert.equal(typeof handler, 'function')
  const result = await handler(
    { agent: baseAgent, turn: 0, step: 1 },
    async () => ({ provider: 'deepseek-official', model: 'gpt-5.5' }),
  )
  assert.deepEqual(resolveCalls, [['deepseek-official', 'gpt-5.5']])
  // sisyphus+gpt default sampling effort is 'medium'; supported set {off,low}
  // clamps it down to 'low' through the live llm capability.
  assert.equal(result.reasoningEffort, 'low')
})

test('agent/request drops effort when the model advertises no reasoning', async () => {
  const llm = { resolveModelInfo: async () => ({}) }
  const handlers = driverCtx(roleFace(), llm)
  const handler = handlers.get('agent/request')
  const result = await handler(
    { agent: baseAgent, turn: 0, step: 1 },
    async () => ({ provider: 'deepseek-official', model: 'gpt-5.5' }),
  )
  assert.equal(result.reasoningEffort, undefined)
})

test('agent/request forwards effort unchanged when capability lookup fails', async () => {
  const llm = { resolveModelInfo: async () => { throw new Error('catalog down') } }
  const handlers = driverCtx(roleFace(), llm)
  const handler = handlers.get('agent/request')
  const result = await handler(
    { agent: baseAgent, turn: 0, step: 1 },
    async () => ({ provider: 'deepseek-official', model: 'gpt-5.5' }),
  )
  assert.equal(result.reasoningEffort, 'medium')
})

test('agent/request without an llm service forwards effort unchanged', async () => {
  const handlers = driverCtx(roleFace(), undefined)
  const handler = handlers.get('agent/request')
  const result = await handler(
    { agent: baseAgent, turn: 0, step: 1 },
    async () => ({ provider: 'deepseek-official', model: 'gpt-5.5' }),
  )
  assert.equal(result.reasoningEffort, 'medium')
})

test('coerced ultrawork {model:{}} no longer shadows the role primary', async () => {
  const omoRoles = {
    roleFor: () => 'sisyphus',
    configFor: () => ({
      model: { provider: 'zai-coding-plan', model: 'glm-5.3' },
      fallbackModels: [],
      ultrawork: { model: {} },
    }),
    fallbackModelsFor: () => [],
    primaryModelFor: () => ({ provider: 'zai-coding-plan', model: 'glm-5.3' }),
  }
  const llm = { resolveModelInfo: async () => ({}) }
  const handlers = driverCtx(omoRoles, llm)
  // Simulate an ultrawork keyword claim for this turn.
  const claim = handlers.get('agent/inbox/claimed')
  assert.equal(typeof claim, 'function')
  claim({ agent: baseAgent, message: { content: [{ type: 'text', text: 'run ultrawork on this' }] }, turn: 0 })
  const handler = handlers.get('agent/request')
  const result = await handler(
    { agent: baseAgent, turn: 0, step: 1 },
    async () => ({ provider: 'deepseek-official', model: 'gpt-5.5' }),
  )
  // The coerced {} model must not become the route; the role primary wins.
  assert.equal(result.provider, 'zai-coding-plan')
  assert.equal(result.model, 'glm-5.3')
})

/* ── host: ultrawork sanitize + partial-POST preservation ────────────────── */

test('sanitizeUltrawork drops coerced {} models and empty overrides', () => {
  assert.equal(sanitizeUltrawork(undefined), undefined)
  assert.equal(sanitizeUltrawork({}), undefined)
  assert.equal(sanitizeUltrawork({ model: {} }), undefined)
  assert.equal(sanitizeUltrawork({ model: { provider: '', model: 'x' } }), undefined)
  assert.deepEqual(
    sanitizeUltrawork({ model: { provider: 'p', model: 'm' } }),
    { model: { provider: 'p', model: 'm' } },
  )
  assert.deepEqual(sanitizeUltrawork({ reasoningEffort: 'max' }), { reasoningEffort: 'max' })
  assert.deepEqual(
    sanitizeUltrawork({ model: {}, reasoningEffort: 'high' }),
    { reasoningEffort: 'high' },
  )
})

/** Shared seed read by the next MemorySettings instance a boot creates. */
const settingsSeed = { value: {} }

class MemorySettings extends SettingsProvider {
  doc = structuredClone(settingsSeed.value)
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

async function bootHost() {
  const ctx = new Context()
  await ctx.plugin({ name: 'memory-settings', inject: [], apply(ctx) { ctx.plugin(MemorySettings) } })
  await ctx.plugin({ name: 'mock-web-server', inject: [], apply(ctx) { ctx.plugin(MockWebServer) } })
  await ctx.plugin({ name: 'mock-llm', inject: [], apply(ctx) { ctx.plugin(MockLlm) } })
  await ctx.plugin({ name: hostName, inject: hostInject, apply: hostApply })
  return { ctx, web: ctx.get('webServer') }
}

async function call(web, path, body) {
  const req = new EventEmitter()
  req.method = body === undefined ? 'GET' : 'POST'
  req.url = body === undefined ? path : undefined
  let status = 200
  let payload = ''
  const res = new EventEmitter()
  res.writeHead = code => { status = code }
  res.end = chunk => { payload = typeof chunk === 'string' ? chunk : '' }
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

test('partial role-config POST preserves maxSteps and ultrawork (A0-4)', async () => {
  const { ctx, web } = await bootHost()
  const roles = ctx.get('omoRoles')
  await roles.setRoleConfig('sisyphus', {
    model: { provider: 'zai-coding-plan', model: 'glm-5.3', reasoningEffort: 'high' },
    fallbackModels: [{ provider: 'moonshotai', model: 'kimi-k2.7-code' }],
    maxSteps: 42,
    ultrawork: { model: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, reasoningEffort: 'max' },
  })

  // A model-only POST (exactly what the settings UI sends) must not wipe the
  // omitted fields.
  const response = await call(web, ROLE_CONFIG_ENDPOINT, {
    role: 'sisyphus',
    model: { provider: 'tokeness', model: 'claude-opus-5' },
    fallbackModels: [{ provider: 'moonshotai', model: 'kimi-k2.7-code' }],
  })
  assert.equal(response.status, 200)
  assert.equal(response.payload.ok, true)
  const config = response.payload.config
  assert.deepEqual(config.model, { provider: 'tokeness', model: 'claude-opus-5' })
  assert.equal(config.maxSteps, 42)
  assert.deepEqual(config.ultrawork, {
    model: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    reasoningEffort: 'max',
  })
  assert.deepEqual(config.fallbackModels, [{ provider: 'moonshotai', model: 'kimi-k2.7-code' }])
})

test('registry never exposes a legacy coerced ultrawork {} model to readers', async () => {
  // Seed the exact row the old implicit-{} schema produced in the wild.
  settingsSeed.value = {
    'opencode-omo-roles': {
      roles: {
        atlas: {
          model: { provider: 'tokeness', model: 'claude-opus-5' },
          fallbackModels: [],
          ultrawork: { model: {} },
        },
      },
      sessions: {},
    },
  }
  try {
    const { ctx } = await bootHost()
    const roles = ctx.get('omoRoles')
    const config = roles.configFor('atlas')
    assert.equal(config.ultrawork, undefined)
    assert.deepEqual(config.model, { provider: 'tokeness', model: 'claude-opus-5' })
    const all = roles.configs()
    assert.equal(all.atlas?.ultrawork, undefined)
  } finally {
    settingsSeed.value = {}
  }
})
