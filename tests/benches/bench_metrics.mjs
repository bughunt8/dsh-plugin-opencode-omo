// Normalized performance metrics for dsh and opencode bench transcripts.
// Both sides emit provider usage (input/output/reasoning/cache tokens) and
// timestamped tool calls, but under different shapes; these helpers reduce
// them to one comparison vocabulary so eval_perf.mjs can diff them directly.
//
// Normalized vocabulary:
//   requests          [{ inputTokens, outputTokens, reasoningTokens,
//                        cacheReadTokens, cacheWriteTokens }]
//   tokens            aggregate of the above
//   cache             { readRatio, readTokens, writeTokens }
//   wallMs            first-event -> last-event duration
//   steps             [{ id, startMs, endMs, firstChunkMs }]
//   toolCalls         [{ name, durationMs, status }]
//   tools             per-tool { count, totalMs, minMs, maxMs, avgMs, errors }

function sum(values, field) {
  return values.reduce((total, value) => total + (Number(field === undefined ? value : value?.[field]) || 0), 0)
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0
}

function aggregateTools(calls) {
  const tools = {}
  for (const call of calls) {
    const entry = tools[call.name] ??= { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0, errors: 0 }
    entry.count += 1
    if (call.status === 'error') entry.errors += 1
    if (call.durationMs !== null) {
      entry.totalMs += call.durationMs
      entry.minMs = Math.min(entry.minMs, call.durationMs)
      entry.maxMs = Math.max(entry.maxMs, call.durationMs)
    }
  }
  for (const entry of Object.values(tools)) {
    entry.avgMs = entry.count > 0 ? Number((entry.totalMs / entry.count).toFixed(1)) : 0
    if (entry.minMs === Infinity) entry.minMs = null
    if (entry.maxMs === 0) entry.maxMs = null
    entry.totalMs = Number(entry.totalMs.toFixed(1))
  }
  return tools
}

function summarize(tokens, timings, wallMs) {
  const promptTokens = tokens.inputTokens + tokens.cacheReadTokens
  return {
    tokens,
    cache: {
      readTokens: tokens.cacheReadTokens,
      writeTokens: tokens.cacheWriteTokens,
      readRatio: percent(tokens.cacheReadTokens, promptTokens),
    },
    wallMs,
    requests: timings.requests.length,
    ttft: {
      minMs: timings.ttft.length === 0 ? null : Math.min(...timings.ttft),
      maxMs: timings.ttft.length === 0 ? null : Math.max(...timings.ttft),
      avgMs: timings.ttft.length === 0 ? null : Number((sum(timings.ttft) / timings.ttft.length).toFixed(1)),
    },
    stepMs: {
      minMs: timings.stepMs.length === 0 ? null : Math.min(...timings.stepMs),
      maxMs: timings.stepMs.length === 0 ? null : Math.max(...timings.stepMs),
      avgMs: timings.stepMs.length === 0 ? null : Number((sum(timings.stepMs) / timings.stepMs.length).toFixed(1)),
    },
    tools: aggregateTools(timings.toolCalls),
    toolCount: timings.toolCalls.length,
  }
}

function eventTimes(events, time) {
  return events.map(event => event?.[time]).filter(Number.isFinite)
}

function findResultByCallId(results, callId) {
  return results.find(result => result.callId === callId)
}

/** dsh session export: tool/call + tool/result + assistant/message.usage. */
export function dshMetrics(run) {
  const events = run.events ?? []
  const byStep = new Map()
  const calls = new Map()
  const results = new Map()
  const tokens = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const requests = []
  const toolCalls = []

  for (const event of events) {
    const data = event.data ?? {}
    if (event.type === 'step/start') {
      byStep.set(`${data.turn}:${data.step}`, { id: `${data.turn}.${data.step}`, startMs: event.time })
    } else if (event.type === 'step/end') {
      const step = byStep.get(`${data.turn}:${data.step}`)
      if (step) step.endMs = event.time
    } else if (event.type === 'assistant/chunk') {
      const step = byStep.get(`${data.turn}:${data.step}`)
      if (step && step.firstChunkMs === undefined) step.firstChunkMs = event.time
    } else if (event.type === 'assistant/message' && data.usage) {
      const usage = data.usage
      const request = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      }
      requests.push(request)
      for (const field of Object.keys(tokens)) tokens[field] += request[field]
    } else if (event.type === 'tool/call') {
      calls.set(data.callId, { name: data.name, callMs: event.time, resultMs: null, isError: false })
    } else if (event.type === 'tool/result') {
      const callId = data.message?.source?.callId
      const payload = data.message?.content?.[0]
      const isError = payload?.isError === true
        || payload?.content?.some?.(block => block?.isError === true)
      results.set(callId, { time: event.time, isError })
    }
  }

  for (const [callId, call] of calls) {
    const result = results.get(callId)
    if (result) {
      call.resultMs = result.time
      call.isError = result.isError
    }
    toolCalls.push({
      name: call.name,
      durationMs: call.resultMs === null ? null : Number((call.resultMs - call.callMs).toFixed(1)),
      status: result && call.isError ? 'error' : 'completed',
    })
  }

  const times = eventTimes(events, 'time')
  const wallMs = times.length < 2 ? 0 : Number((Math.max(...times) - Math.min(...times)).toFixed(1))
  const timings = {
    requests,
    ttft: [...byStep.values()].filter(step => step.firstChunkMs !== undefined).map(step => Number((step.firstChunkMs - step.startMs).toFixed(1))),
    stepMs: [...byStep.values()].filter(step => step.startMs !== undefined && step.endMs !== undefined).map(step => Number((step.endMs - step.startMs).toFixed(1))),
    toolCalls,
  }
  return summarize(tokens, timings, wallMs)
}

/** opencode export: message info.tokens + tool parts carry time.{start,end}. */
export function opencodeMetrics(run) {
  const messages = run.exported?.messages ?? []
  const events = run.events ?? []
  const tokens = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const requests = []
  for (const message of messages) {
    const info = message.info?.tokens
    if (!info) continue
    const request = {
      inputTokens: info.input ?? 0,
      outputTokens: info.output ?? 0,
      reasoningTokens: info.reasoning ?? 0,
      cacheReadTokens: info.cache?.read ?? 0,
      cacheWriteTokens: info.cache?.write ?? 0,
    }
    requests.push(request)
    for (const field of Object.keys(tokens)) tokens[field] += request[field]
  }

  // opencode puts per-tool start/end under the live `tool_use` event's
  // `part.state.time`; `opencode export` omits them from the persisted parts.
  const toolCalls = events
    .filter(event => event.type === 'tool_use')
    .map(event => {
      const part = event.part ?? {}
      const state = part.state ?? {}
      return {
        name: part.tool ?? part.toolName ?? 'unknown',
        durationMs: Number.isFinite(state.time?.end) && Number.isFinite(state.time?.start)
          ? Number((state.time.end - state.time.start).toFixed(1))
          : null,
        status: state.status === 'error' || state.error ? 'error' : 'completed',
      }
    })

  const steps = new Map()
  for (const event of events) {
    const key = event.part?.messageID
    if (event.type === 'step_start') {
      steps.set(key, { id: key, startMs: event.timestamp, endMs: null, firstChunkMs: null })
    } else if (event.type === 'step_finish' && steps.has(key)) {
      steps.get(key).endMs = event.timestamp
    } else if (steps.has(key) && steps.get(key).firstChunkMs === null
      && ['reasoning', 'text', 'tool_use'].includes(event.type)) {
      steps.get(key).firstChunkMs = event.timestamp
    }
  }

  const times = eventTimes(events, 'timestamp')
  const wallMs = times.length < 2 ? 0 : Number((Math.max(...times) - Math.min(...times)).toFixed(1))
  const timings = {
    requests,
    ttft: [...steps.values()].filter(step => step.firstChunkMs !== null).map(step => Number((step.firstChunkMs - step.startMs).toFixed(1))),
    stepMs: [...steps.values()].filter(step => step.startMs !== undefined && step.endMs !== null).map(step => Number((step.endMs - step.startMs).toFixed(1))),
    toolCalls,
  }
  return summarize(tokens, timings, wallMs)
}

/** Metrics for one raw run row (`{ dsh, opencode }`). */
export function rowMetrics(row) {
  return {
    id: row.id,
    dsh: row.dsh?.events ? dshMetrics(row.dsh) : null,
    opencode: row.opencode?.exported ? opencodeMetrics(row.opencode) : null,
  }
}

/** Aggregate metrics rows into one per-system summary. */
export function aggregateMetrics(rows) {
  const systems = ['dsh', 'opencode']
  const aggregate = Object.fromEntries(systems.map(system => [system, {
    items: rows.filter(row => row[system] !== null).length,
    tokens: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    requests: 0,
    toolCount: 0,
    wallMs: 0,
    ttft: [],
    stepMs: [],
    tools: {},
  }]))
  for (const row of rows) {
    for (const system of systems) {
      const metrics = row[system]
      const target = aggregate[system]
      if (metrics === null) continue
      for (const field of Object.keys(target.tokens)) target.tokens[field] += metrics.tokens[field]
      target.requests += metrics.requests
      target.toolCount += metrics.toolCount
      target.wallMs += metrics.wallMs
      if (metrics.ttft.avgMs !== null) target.ttft.push(metrics.ttft.avgMs)
      if (metrics.stepMs.avgMs !== null) target.stepMs.push(metrics.stepMs.avgMs)
      for (const [name, stats] of Object.entries(metrics.tools)) {
        const entry = target.tools[name] ??= { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0, errors: 0 }
        entry.count += stats.count
        entry.errors += stats.errors
        entry.totalMs += stats.totalMs
        if (stats.minMs !== null) entry.minMs = Math.min(entry.minMs, stats.minMs)
        if (stats.maxMs !== null) entry.maxMs = Math.max(entry.maxMs, stats.maxMs)
      }
    }
  }
  for (const target of Object.values(aggregate)) {
    const prompt = target.tokens.inputTokens + target.tokens.cacheReadTokens
    target.cache = {
      readTokens: target.tokens.cacheReadTokens,
      writeTokens: target.tokens.cacheWriteTokens,
      readRatio: percent(target.tokens.cacheReadTokens, prompt),
    }
    target.wallMsAvg = target.items === 0 ? null : Number((target.wallMs / target.items).toFixed(1))
    target.ttftAvg = target.ttft.length === 0 ? null : Number((sum(target.ttft) / target.ttft.length).toFixed(1))
    target.stepMsAvg = target.stepMs.length === 0 ? null : Number((sum(target.stepMs) / target.stepMs.length).toFixed(1))
    for (const entry of Object.values(target.tools)) {
      entry.avgMs = entry.count > 0 ? Number((entry.totalMs / entry.count).toFixed(1)) : null
      if (entry.minMs === Infinity) entry.minMs = null
      if (entry.maxMs === 0) entry.maxMs = null
      entry.totalMs = Number(entry.totalMs.toFixed(1))
    }
    target.tools = Object.fromEntries(Object.entries(target.tools).sort(([a], [b]) => a.localeCompare(b)))
  }
  return aggregate
}
