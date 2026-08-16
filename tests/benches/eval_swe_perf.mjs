// Compare cache/timing metrics for one run_swe_sample.mjs output directory.
//   node eval_swe_perf.mjs .runs/swe-sphinx-doc__sphinx-10323 [--json]
import { readFileSync, writeFileSync } from 'node:fs'
import { dshMetrics, opencodeMetrics } from './bench_metrics.mjs'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node eval_swe_perf.mjs <swe-run-dir> [--json]')
  process.exit(2)
}
const asJson = process.argv.includes('--json')
const read = file => JSON.parse(readFileSync(new URL(file, new URL(`${dir}/`, import.meta.url)), 'utf8'))

const dsh = dshMetrics(read('dsh.json'))
const opencode = opencodeMetrics(read('opencode.json'))
const output = { dir, dsh, opencode }
writeFileSync(new URL('metrics.json', new URL(`${dir}/`, import.meta.url)), JSON.stringify(output, null, 2))

if (asJson) {
  console.log(JSON.stringify(output, null, 2))
  process.exit(0)
}

for (const [name, metrics] of Object.entries({ dsh, opencode })) {
  console.log(`${name}: requests=${metrics.requests} wall=${metrics.wallMs}ms stepAvg=${metrics.stepMs.avgMs}ms ttftAvg=${metrics.ttft.avgMs}ms`)
  console.log(`  tokens in=${metrics.tokens.inputTokens} out=${metrics.tokens.outputTokens} reasoning=${metrics.tokens.reasoningTokens}`)
  console.log(`  cache read=${metrics.cache.readTokens} (${(metrics.cache.readRatio * 100).toFixed(1)}%) write=${metrics.cache.writeTokens} tools=${metrics.toolCount}`)
  for (const [tool, stats] of Object.entries(metrics.tools)) {
    console.log(`  ${tool}: n=${stats.count} avg=${stats.avgMs}ms min=${stats.minMs}ms max=${stats.maxMs}ms errors=${stats.errors}`)
  }
}
