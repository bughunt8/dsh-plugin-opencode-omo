// Compare cache hits, token usage, and tool-call timing between the dsh and
// opencode transcripts saved by run_bench.mjs.
//
//   node eval_perf.mjs <run-dir>           # e.g. .runs/human-eval-seed1
//   node eval_perf.mjs <run-dir> --json    # print the full metrics object
//
// Writes <run-dir>/metrics.json and prints a human-readable comparison.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { aggregateMetrics, rowMetrics } from './bench_metrics.mjs'

const runDir = process.argv[2]
if (!runDir) {
  console.error('usage: node eval_perf.mjs <run-dir> [--json]')
  process.exit(2)
}
const asJson = process.argv.includes('--json')

const files = readdirSync(runDir)
  .filter(file => file.endsWith('.json') && file !== 'summary.json' && file !== 'metrics.json')
  .sort()
const rows = files.map(file => rowMetrics(JSON.parse(readFileSync(new URL(`${file}`, new URL(`${runDir}/`, import.meta.url)), 'utf8'))))
const aggregate = aggregateMetrics(rows)
const output = { runDir, files: rows.length, rows, aggregate }
writeFileSync(new URL('metrics.json', new URL(`${runDir}/`, import.meta.url)), JSON.stringify(output, null, 2))

if (asJson) {
  console.log(JSON.stringify(output, null, 2))
  process.exit(0)
}

function fmt(value, digits = 1) {
  return value === null || value === undefined ? '–' : Number(value).toFixed(digits)
}

function table(title, headers, rows) {
  console.log(`\n${title}`)
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map(row => String(row[index]).length),
  ))
  const line = row => `| ${row.map((cell, index) => String(cell).padEnd(widths[index])).join(' | ')} |`
  console.log(line(headers))
  console.log(`|${widths.map(width => '-'.repeat(width + 2)).join('|')}|`)
  for (const row of rows) console.log(line(row))
}

console.log(`run dir: ${runDir}  items: ${rows.length}`)
for (const system of ['dsh', 'opencode']) {
  const metrics = aggregate[system]
  console.log(`\n== ${system} ==`)
  console.log(`requests ${metrics.requests}  wall avg ${fmt(metrics.wallMsAvg)}ms  step avg ${fmt(metrics.stepMsAvg)}ms  TTFT avg ${fmt(metrics.ttftAvg)}ms`)
  console.log(`tokens  in ${metrics.tokens.inputTokens}  out ${metrics.tokens.outputTokens}  reasoning ${metrics.tokens.reasoningTokens}`)
  console.log(`cache   read ${metrics.cache.readTokens} (${fmt(metrics.cache.readRatio * 100)}%)  write ${metrics.cache.writeTokens}  tool calls ${metrics.toolCount}`)
}

table('tool durations (aggregate)', ['tool', 'system', 'count', 'avg ms', 'min ms', 'max ms', 'errors'], (() => {
  const rows = []
  for (const system of ['dsh', 'opencode']) {
    for (const [name, stats] of Object.entries(aggregate[system].tools)) {
      rows.push([name, system, stats.count, stats.avgMs ?? '–', stats.minMs ?? '–', stats.maxMs ?? '–', stats.errors])
    }
  }
  return rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || a[1].localeCompare(b[1]))
})())

table('per-item summary', ['id', 'dsh cache%', 'oc cache%', 'dsh wall ms', 'oc wall ms', 'dsh tools', 'oc tools'], rows.map(row => [
  row.id,
  fmt(row.dsh?.cache.readRatio * 100),
  fmt(row.opencode?.cache.readRatio * 100),
  fmt(row.dsh?.wallMs),
  fmt(row.opencode?.wallMs),
  row.dsh?.toolCount ?? '–',
  row.opencode?.toolCount ?? '–',
]))

console.log(`\nmetrics.json written to ${new URL('metrics.json', new URL(`${runDir}/`, import.meta.url)).pathname}`)
