import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(join(process.env.OMO_SMOKE_RUNTIME, 'package.json'))
const { LlmAdapter } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href)

export const name = 'omo-standalone-test-model'
export const inject = ['llm']

class LocalModel extends LlmAdapter {
  async listModels() {
    return [{ provider: 'omo-test', id: 'local', name: 'Deterministic local test' }]
  }
  async resolveModel(provider, id) {
    return { provider, id, name: 'Deterministic local test', context: { contextWindow: 131072 } }
  }
  async *stream(options) {
    options.signal?.throwIfAborted()
    assert.equal(options.provider, 'omo-test')
    assert.match(options.system, /<env>/)
    assert.ok(options.messages.some(message => message.role === 'user'))
    const text = 'OMO_STANDALONE_OK'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter(['omo-test'], new LocalModel()), 'isolated deterministic model')
}
