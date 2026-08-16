// Evaluate a run_probes.mjs output directory and produce paired statistics.
//   node eval_probes.mjs <probe-dir> [--json]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { binaryComparison } from './eval_stats.mjs'

const runDir = process.argv[2]
const asJson = process.argv.includes('--json')
if (!runDir) {
  console.error('usage: node eval_probes.mjs <probe-dir> [--json]')
  process.exit(2)
}

function regexCheck(pattern, flags, text) {
  try { return new RegExp(pattern, flags).test(text ?? '') } catch { return false }
}
function passes(run, probe) {
  if (run?.error) return false
  const text = run.finalText ?? ''
  switch (probe.check) {
    case 'regex':
      return regexCheck(probe.pattern, probe.flags ?? '', text)
    case 'not-regex':
      return !regexCheck(probe.pattern, probe.flags ?? '', text)
    case 'json': {
      try {
        const parsed = JSON.parse(text.trim().replace(/^```(?:json)?|```$/g, '').trim())
        return parsed?.[probe.field] === probe.expected
      } catch {
        return false
      }
    }
    case 'file-equals':
      return run.file === probe.expected && regexCheck(probe.finalRegex, '', text)
    case 'file-regex':
      return run.file === probe.expected && regexCheck(probe.finalRegex, probe.flags ?? '', text)
    default:
      return false
  }
}

const rows = []
const files = readdirSync(runDir).filter(file => file.endsWith('.json') && file !== 'summary.json' && file !== 'results.json')
for (const file of files.sort()) {
  const row = JSON.parse(readFileSync(new URL(`${file}`, new URL(`${runDir}/`, import.meta.url)), 'utf8'))
  const probe = row.probe
  const runs = row.runs.map(run => ({
    repeat: run.repeat,
    dshFirst: run.dshFirst,
    dshPass: passes(run.dsh, probe),
    ocPass: passes(run.opencode, probe),
    dshFile: run.dsh?.file ?? null,
    ocFile: run.opencode?.file ?? null,
    dshTools: run.dsh?.tools ?? [],
    ocTools: run.opencode?.tools ?? [],
  }))
  rows.push({ id: row.id, runs })
}
const pairs = rows.flatMap(row => row.runs)
const dshPass = pairs.map(pair => pair.dshPass)
const ocPass = pairs.map(pair => pair.ocPass)
const perProbe = rows.map(row => ({
  id: row.id,
  dshRate: row.runs.filter(run => run.dshPass).length / row.runs.length,
  ocRate: row.runs.filter(run => run.ocPass).length / row.runs.length,
}))
const output = {
  runDir,
  perProbe,
  repeatLevel: binaryComparison(dshPass, ocPass, { equivalenceMargin: 0.05 }),
}
writeFileSync(new URL('results.json', new URL(`${runDir}/`, import.meta.url)), JSON.stringify(output, null, 2))
if (asJson) {
  console.log(JSON.stringify(output, null, 2))
  process.exit(0)
}
console.log(JSON.stringify(output, null, 2))
