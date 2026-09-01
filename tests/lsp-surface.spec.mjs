/**
 * Pure-helper and thin execute-path tests for the omo LSP surface:
 * catalog hiding, navigation over ctx.lsp.query, and fallback names.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  apply,
  applyOmoLspCatalog,
  FALLBACK_LSP_TOOLS,
  HIDDEN_DSH_LSP_TOOLS,
  name,
  rewriteLspPromptSection,
} from '../presets/opencode-omo/lsp-surface.mjs'

test('module identity', () => {
  assert.equal(name, 'opencode-omo-lsp-surface')
  assert.deepEqual(HIDDEN_DSH_LSP_TOOLS, ['lsp'])
})

test('applyOmoLspCatalog drops the hidden dsh lsp name', () => {
  const kept = { name: 'lsp_find_references' }
  const catalog = applyOmoLspCatalog([
    { name: 'lsp' },
    kept,
    { name: 'read' },
    { description: 'nameless' },
  ])
  assert.deepEqual(catalog, [kept, { name: 'read' }])
})

test('rewriteLspPromptSection points at the omo names', () => {
  const rewritten = rewriteLspPromptSection(
    'Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous.',
  )
  assert.match(rewritten, /lsp_goto_definition/)
  assert.match(rewritten, /lsp_find_references/)
  assert.doesNotMatch(rewritten, /Use lsp when/)
})

function mockLspCtx(lsp) {
  const registered = new Map()
  const listeners = new Map()
  return {
    get(service) {
      if (service === 'lsp') {
        if (lsp === undefined) throw new Error('service not found: lsp')
        return lsp
      }
      throw new Error(`service not found: ${service}`)
    },
    tools: {
      register(tool) {
        registered.set(tool.name, tool)
      },
    },
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
    },
    registered,
    listeners,
  }
}

test('apply registers navigation names and fallback names', () => {
  const ctx = mockLspCtx({ query: async () => ({ kind: 'locations', locations: [] }) })
  apply(ctx)
  assert.ok(ctx.registered.has('lsp_goto_definition'))
  assert.ok(ctx.registered.has('lsp_find_references'))
  assert.ok(ctx.registered.has('lsp_go_to_implementation'))
  assert.ok(ctx.registered.has('lsp_hover'))
  for (const toolName of FALLBACK_LSP_TOOLS) {
    assert.ok(ctx.registered.has(toolName), toolName)
  }
  assert.equal(ctx.registered.has('lsp'), false)
})

test('navigation maps onto ctx.lsp.query with zero-based positions', async () => {
  const queries = []
  const ctx = mockLspCtx({
    query(request, signal) {
      queries.push({ request, signal })
      return {
        kind: 'locations',
        locations: [],
        resolvedWorkspaceUri: 'file:///repo',
      }
    },
  })
  apply(ctx)
  const signal = AbortSignal.timeout(1_000)
  const result = await ctx.registered.get('lsp_find_references').execute(
    { filePath: 'src/a.ts', line: 3, character: 5 },
    { signal, agent: { session: { header: { cwd: '/repo' } } } },
  )
  assert.equal(result.kind, 'locations')
  assert.deepEqual(queries[0].request, {
    operation: 'findReferences',
    filePath: 'src/a.ts',
    position: { line: 2, character: 4 },
    workspaceRoot: '/repo',
  })
  assert.equal(queries[0].signal, signal)
})

test('navigation rejects a missing session cwd', async () => {
  const ctx = mockLspCtx({
    query() {
      throw new Error('query should not run')
    },
  })
  apply(ctx)
  await assert.rejects(
    () => ctx.registered.get('lsp_goto_definition').execute(
      { filePath: 'a.ts', line: 1, character: 1 },
      { agent: { session: { header: {} } } },
    ),
    /session workspace cwd/,
  )
})

test('fallback tools return the harness-missing message without calling lsp', async () => {
  const ctx = mockLspCtx({
    query() {
      throw new Error('query should not run')
    },
  })
  apply(ctx)
  const diagnostics = await ctx.registered.get('lsp_diagnostics').execute({ filePath: 'a.ts' }, {})
  assert.match(diagnostics.text, /no LSP diagnostics/)
  assert.match(diagnostics.text, /tsc --noEmit/)
  const rename = await ctx.registered.get('lsp_rename').execute({ filePath: 'a.ts' }, {})
  assert.match(rename.text, /lsp_find_references/)
})

test('pre-execute denies the hidden dsh lsp name', async () => {
  const ctx = mockLspCtx({ query: async () => ({}) })
  apply(ctx)
  const [deny] = ctx.listeners.get('tools/pre-execute')
  const decision = await deny({ name: 'lsp' }, () => ({ kind: 'allow' }))
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /hidden dsh name/)
  const allowed = await deny({ name: 'lsp_find_references' }, () => ({ kind: 'allow' }))
  assert.deepEqual(allowed, { kind: 'allow' })
})
