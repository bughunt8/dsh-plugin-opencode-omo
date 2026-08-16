// Shared bench utilities: data loaders, prompt builders, and trace metrics.
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const DATA = new URL('.data/', import.meta.url)

export function loadHumanEval(limit = Infinity) {
  const bytes = readFileSync(new URL('HumanEval.jsonl.gz', DATA))
  const lines = gunzipSync(bytes).toString('utf8').split('\n').filter(Boolean)
  return lines.map(line => JSON.parse(line)).slice(0, limit)
}

export function loadMbpp(limit = Infinity) {
  const text = readFileSync(new URL('mbpp.jsonl', DATA), 'utf8')
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line)).slice(0, limit)
}

/** A shared task prompt that forces both systems through the same file/tool path. */
export function codingPrompt(task, { withTests }) {
  const tests = withTests ?? ''
  return [
    'You are solving a Python programming benchmark task. Work in the current directory.',
    'Use the file tools to create `solution.py` containing exactly the requested function (no extra output, no __main__ block).',
    'Then run the verification command below with bash and keep fixing until it passes.',
    '',
    'TASK:',
    task,
    ...(tests === '' ? [] : ['', 'VERIFY WITH:', `python3 - <<'PY'\n${tests}\nPY`]),
  ].join('\n')
}

export function humanEvalPrompt(item) {
  const tests = `from solution import ${item.entry_point}\n${item.test}`
  return codingPrompt(`${item.prompt}\nFunction name: ${item.entry_point}`, { withTests: tests })
}

/**
 * MBPP rows carry no entry_point; the ground-truth function name lives in the
 * first assert (`assert name(`) or in the reference code's `def name(`.
 * Prompting `Function name: undefined` (the old behavior) makes both systems
 * spend effort on a benchmark artifact and drives pass/trace divergence.
 */
export function mbppEntryPoint(item) {
  const testText = Array.isArray(item.test_list) ? item.test_list.join(' ') : String(item.test_list ?? '')
  const fromAssert = testText.match(/\bassert\s+([A-Za-z_]\w*)\s*\(/)
  if (fromAssert !== null) return fromAssert[1]
  const fromCode = String(item.code ?? '').match(/^def\s+([A-Za-z_]\w*)/m)
  if (fromCode !== null) return fromCode[1]
  const fromText = String(item.text ?? '').match(/\b([A-Za-z_]\w*)\s*\(/)
  return fromText?.[1] ?? 'undefined'
}

export function mbppPrompt(item) {
  const entryPoint = mbppEntryPoint(item)
  const tests = `from solution import ${entryPoint}\n${item.test_list.join('\n')}`
  return codingPrompt(`${item.text}\nFunction name: ${entryPoint}`, { withTests: tests })
}

export function extractPythonCode(text) {
  const fences = [...text.matchAll(/```(?:python|py)?\s*([\s\S]*?)```/g)].map(m => m[1].trim())
  if (fences.length > 0) return fences.at(-1)
  // Last-resort: strip prose lines until the first def/import.
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^\s*(def |import |from |class )/.test(line))
  return start < 0 ? '' : lines.slice(start).join('\n')
}

export function dshTrace(run) {
  const toolCalls = run.events
    .filter(e => e.type === 'tool/call')
    .map(e => ({ name: e.data?.name, args: e.data?.arguments, seq: e.seq }))
  const reasoning = run.events
    .flatMap(e => e.type === 'assistant/message'
      ? (e.data?.message?.content ?? []).filter(b => b.type === 'reasoning').map(b => b.text)
      : e.type === 'assistant/chunk' && e.data?.chunk?.type === 'reasoning-delta'
        ? [e.data.chunk.text]
        : [])
    .join('')
  const finalText = run.events.filter(e => e.type === 'assistant/message').at(-1)?.data?.message?.content
    ?.filter(b => b.type === 'text').map(b => b.text).join('') ?? ''
  return { system: 'dsh', toolCalls, reasoningChars: reasoning.length, reasoning, finalText }
}

export function opencodeTrace(run) {
  const parts = run.exported?.messages?.flatMap(m => m.parts ?? []) ?? []
  const toolCalls = parts
    .filter(p => p.type === 'tool' || p.type === 'tool-invocation')
    .map(p => ({ name: p.tool ?? p.toolName ?? p.state?.input?.tool, args: p.state?.input ?? p.input }))
  const reasoning = parts.filter(p => p.type === 'reasoning').map(p => p.text ?? '').join('')
  const finalText = run.events.filter(e => e.type === 'text').map(e => e.part?.text ?? '').at(-1) ?? ''
  return { system: 'opencode', toolCalls, reasoningChars: reasoning.length, reasoning, finalText }
}

export function tokenJaccard(a, b) {
  const at = new Set(String(a ?? '').toLowerCase().split(/\W+/).filter(Boolean))
  const bt = new Set(String(b ?? '').toLowerCase().split(/\W+/).filter(Boolean))
  if (at.size + bt.size === 0) return 1
  let inter = 0
  for (const token of at) if (bt.has(token)) inter += 1
  return inter / (at.size + bt.size - inter)
}
