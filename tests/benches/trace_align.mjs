// Trajectory-level alignment for the two harnesses.
// Input: raw run objects produced by dsh_runner.mjs ({events}) and
// opencode_runner.mjs ({events, exported}).
// Output: normalized tool-call sequence, Levenshtein distance, normalized
// similarity, divergence point (first index where the sequences differ), and
// per-tool count deltas. Text similarity is deliberately NOT part of this
// module: tool traces are the comparable behavioral surface.

import { createHash } from 'node:crypto'

function sha8(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

function cleanPath(text) {
  return String(text ?? '').replace(/\/tmp\/[^ "'\n]*/g, '/tmp/…')
    .replace(/\/home\/[^ "'\n]*/g, '/home/…')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function argKey(name, args) {
  if (args === undefined) return ''
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args
    if (name === 'bash') return cleanPath(parsed.command ?? parsed.cmd ?? '').slice(0, 160)
    if (name === 'read' || name === 'write' || name === 'edit') {
      const path = parsed.file_path ?? parsed.filePath ?? parsed.path ?? ''
      return cleanPath(path).slice(0, 160)
    }
    if (name === 'grep' || name === 'glob') return cleanPath(parsed.pattern ?? '').slice(0, 80)
    return sha8(cleanPath(JSON.stringify(parsed)).slice(0, 400))
  } catch {
    return sha8(cleanPath(String(args)).slice(0, 400))
  }
}

/** Normalize one tool-call record into {name, key}. */
export function toolSignature(name, args) {
  const key = argKey(name, args)
  return { name, key, token: key === '' ? name : `${name}:${sha8(key)}` }
}

export function dshToolTrace(run) {
  return (run?.events ?? [])
    .filter(event => event.type === 'tool/call')
    .map(event => toolSignature(event.data?.name, event.data?.arguments))
}

export function opencodeToolTrace(run) {
  return (run?.events ?? [])
    .filter(event => event.type === 'tool_use')
    .map(event => {
      const part = event.part ?? {}
      const args = part.state?.input ?? part.input
      return toolSignature(part.tool ?? part.toolName ?? 'unknown', args)
    })
}

/** DP Levenshtein over token arrays; returns distance and operations. */
export function levenshtein(a, b, cost = { insert: 1, delete: 1, substitute: (x, y) => (x === y ? 0 : 1) }) {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i * cost.delete
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j * cost.insert
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + cost.delete,
        matrix[i][j - 1] + cost.insert,
        matrix[i - 1][j - 1] + cost.substitute(a[i - 1], b[j - 1]),
      )
    }
  }
  return matrix[a.length][b.length]
}

/** First index where two sequences diverge (after taking identical prefixes). */
export function divergencePoint(a, b) {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a[index] === b[index]) index += 1
  if (index === limit && a.length === b.length) return null
  return index
}

/** Full summary for one paired trace. */
export function alignTraces(a, b) {
  const tokensA = a.map(signature => signature.token)
  const tokensB = b.map(signature => signature.token)
  const distance = levenshtein(tokensA, tokensB)
  const maxLength = Math.max(tokensA.length, tokensB.length)
  return {
    lengthA: tokensA.length,
    lengthB: tokensB.length,
    distance,
    similarity: maxLength === 0 ? 1 : Number((1 - distance / maxLength).toFixed(4)),
    divergenceAt: divergencePoint(tokensA, tokensB),
    namesA: a.map(signature => signature.name),
    namesB: b.map(signature => signature.name),
  }
}

function countByTool(trace) {
  const counts = {}
  for (const signature of trace) counts[signature.name] = (counts[signature.name] ?? 0) + 1
  return counts
}

/** Per-tool count delta (A - B) with only tools seen by either side. */
export function toolCountDelta(a, b) {
  const countsA = countByTool(a)
  const countsB = countByTool(b)
  const names = new Set([...Object.keys(countsA), ...Object.keys(countsB)])
  return Object.fromEntries([...names].sort().map(name => [name, (countsA[name] ?? 0) - (countsB[name] ?? 0)]))
}
