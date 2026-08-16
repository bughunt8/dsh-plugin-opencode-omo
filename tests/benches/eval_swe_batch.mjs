// Evaluate all run_swe_sample.mjs output directories at once:
// FAIL_TO_PASS verification, patch equality, trace alignment, and performance.
//   node eval_swe_batch.mjs <instanceId...>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dshMetrics, opencodeMetrics } from './bench_metrics.mjs'
import { alignTraces, dshToolTrace, opencodeToolTrace } from './trace_align.mjs'

const ids = process.argv.slice(2)
const root = new URL('.runs/', import.meta.url)
const discovered = ids.length > 0 ? ids : readdirSync(root).filter(name => name.startsWith('swe-'))
const results = []
for (const dir of discovered) {
  const base = new URL(`${dir}/`, root)
  let dsh
  let oc
  try {
    dsh = JSON.parse(readFileSync(new URL('dsh.json', base), 'utf8'))
    oc = JSON.parse(readFileSync(new URL('opencode.json', base), 'utf8'))
  } catch (error) {
    results.push({ id: dir, error: String(error) })
    continue
  }
  const dshTrace = dshToolTrace(dsh)
  const ocTrace = opencodeToolTrace(oc)
  const result = {
    id: dir.replace(/^swe-/, ''),
    dshVerified: dsh.verified?.pass ?? null,
    opencodeVerified: oc.verified?.pass ?? null,
    verifiedAgree: (dsh.verified?.pass ?? null) === (oc.verified?.pass ?? null),
    diffEqual: dsh.diff === oc.diff,
    diffChars: { dsh: dsh.diff?.length ?? 0, opencode: oc.diff?.length ?? 0 },
    alignment: alignTraces(dshTrace, ocTrace),
    dsh: dshMetrics(dsh),
    opencode: opencodeMetrics(oc),
  }
  writeFileSync(new URL('results.json', base), JSON.stringify(result, null, 2))
  results.push(result)
}
const aggregate = {
  instances: results.length,
  verifiedAgree: results.filter(result => result.verifiedAgree).length,
  dshVerifiedCount: results.filter(result => result.dshVerified === true).length,
  opencodeVerifiedCount: results.filter(result => result.opencodeVerified === true).length,
  diffEqualCount: results.filter(result => result.diffEqual === true).length,
  results,
}
console.log(JSON.stringify(aggregate, null, 2))
