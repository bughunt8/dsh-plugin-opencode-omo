// Evaluate a run_exp.mjs output directory: pass/fail on reference tests,
// reasoning exposure, tool-trace alignment, and paired statistical summaries.
//   node eval_exp.mjs <exp-dir> [--json]
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractPythonCode, loadHumanEval, loadMbpp, mbppEntryPoint, tokenJaccard } from './bench_common.mjs'
import { dshMetrics, opencodeMetrics } from './bench_metrics.mjs'
import { alignTraces, dshToolTrace, opencodeToolTrace, toolCountDelta } from './trace_align.mjs'
import { binaryComparison, continuousComparison } from './eval_stats.mjs'

const runDir = process.argv[2]
const asJson = process.argv.includes('--json')
if (!runDir) {
  console.error('usage: node eval_exp.mjs <exp-dir> [--json]')
  process.exit(2)
}
let summary = {}
try {
  summary = JSON.parse(readFileSync(new URL('summary.json', new URL(`${runDir}/`, import.meta.url)), 'utf8'))
} catch {
  // an interrupted run may have task files but no trailing summary
}
const level = summary.level ?? (runDir.includes('mbpp') ? 'mbpp' : 'human-eval')
const dataset = level === 'mbpp' ? loadMbpp(9999) : loadHumanEval(9999)

function runPython(source) {
  return new Promise(resolve => {
    const dir = mkdtempSync(join(tmpdir(), 'omo-eval-exp-'))
    const file = join(dir, 'solution.py')
    writeFileSync(file, source)
    const child = spawn('python3', [file], { timeout: 30_000 })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', () => resolve({ ok: false, detail: 'spawn failed' }))
    child.on('exit', code => {
      rmSync(dir, { recursive: true, force: true })
      resolve({ ok: code === 0, code, stdout, stderr })
    })
  })
}

function testSource(item, solution, finalText) {
  const code = solution && solution.trim() !== '' ? solution : extractPythonCode(finalText ?? '')
  if (code === undefined || code.trim() === '') return undefined
  const name = level === 'mbpp' ? mbppEntryPoint(item) : item.entry_point
  const tests = level === 'mbpp' ? item.test_list.join('\n') : item.test
  return `${code}\n\nfrom solution import ${name}\n${tests}\nprint('ALL_TESTS_PASSED')`
}

function textBlocks(blocks) {
  return (blocks ?? []).filter(block => block?.type === 'text').map(block => block.text ?? '').join('')
}
function reasoningCharsDsh(run) {
  return run?.events
    ?.flatMap(event => event.type === 'assistant/message'
      ? (event.data.message?.content ?? []).filter(block => block.type === 'reasoning').map(block => block.text ?? '')
      : [])
    .join('').length ?? 0
}
function reasoningCharsOc(run) {
  return run?.exported?.messages
    ?.flatMap(message => message.parts ?? [])
    .filter(part => part.type === 'reasoning')
    .map(part => part.text ?? '')
    .join('').length ?? 0
}
function finalTextDsh(run) {
  return textBlocks(run?.events?.filter(event => event.type === 'assistant/message').at(-1)?.data?.message?.content)
}
function finalTextOc(run) {
  const text = run?.events?.filter(event => event.type === 'text').map(event => event.part?.text ?? '').at(-1) ?? ''
  return text
}

function itemFor(id) {
  const direct = dataset.find(entry => String(entry.task_id ?? '').replaceAll('/', '_') === String(id))
  if (direct !== undefined) return direct
  const index = Number(String(id).split('_').at(-1))
  return Number.isInteger(index) ? dataset[index] : undefined
}

const rows = []
const files = readdirSync(runDir).filter(file => file.endsWith('.json') && file !== 'summary.json' && file !== 'results.json')
for (const file of files.sort()) {
  const row = JSON.parse(readFileSync(new URL(`${file}`, new URL(`${runDir}/`, import.meta.url)), 'utf8'))
  const item = itemFor(row.id)
  const runs = row.runs.map(run => {
    const dsh = run.dsh?.error ? undefined : run.dsh
    const oc = run.opencode?.error ? undefined : run.opencode
    const dshFinal = dsh ? finalTextDsh(dsh) : ''
    const ocFinal = oc ? finalTextOc(oc) : ''
    const dshSource = dsh ? testSource(item, dsh.solution, dshFinal) : undefined
    const ocSource = oc ? testSource(item, oc.solution, ocFinal) : undefined
    return {
      repeat: run.repeat,
      dshFirst: run.dshFirst,
      dshPass: dshSource ? (runPython(dshSource)).then(result => result.ok) : Promise.resolve(false),
      ocPass: ocSource ? (runPython(ocSource)).then(result => result.ok) : Promise.resolve(false),
      dshReasoningChars: dsh ? reasoningCharsDsh(dsh) : 0,
      ocReasoningChars: oc ? reasoningCharsOc(oc) : 0,
      dshTools: dsh ? dshToolTrace(dsh) : [],
      ocTools: oc ? opencodeToolTrace(oc) : [],
      dshMetrics: dsh ? dshMetrics(dsh) : null,
      ocMetrics: oc ? opencodeMetrics(oc) : null,
      dshFinal: dshFinal,
      ocFinal: ocFinal,
    }
  })
  const resolved = await Promise.all(runs.map(async run => ({ ...run, dshPass: await run.dshPass, ocPass: await run.ocPass })))
  rows.push({
    id: row.id,
    runs: resolved.map(run => ({
      ...run,
      alignment: alignTraces(run.dshTools, run.ocTools),
      toolDelta: toolCountDelta(run.dshTools, run.ocTools),
      jaccard: tokenJaccard(run.dshFinal, run.ocFinal),
    })),
  })
}

const repeatPairs = rows.flatMap(row => row.runs.map(run => ({ id: row.id, ...run })))
const dshPass = repeatPairs.map(pair => pair.dshPass)
const ocPass = repeatPairs.map(pair => pair.ocPass)
const dshRatePerTask = rows.map(row => row.runs.filter(run => run.dshPass).length / row.runs.length)
const ocRatePerTask = rows.map(row => row.runs.filter(run => run.ocPass).length / row.runs.length)
const dshReasoningPerTask = rows.map(row => row.runs.reduce((sum, run) => sum + run.dshReasoningChars, 0) / row.runs.length)
const ocReasoningPerTask = rows.map(row => row.runs.reduce((sum, run) => sum + run.ocReasoningChars, 0) / row.runs.length)
const traceSimilarity = repeatPairs.map(pair => pair.alignment.similarity)
const traceDistance = repeatPairs.map(pair => pair.alignment.distance)
const toolCountDiff = repeatPairs.map(pair => pair.dshTools.length - pair.ocTools.length)
const jaccard = repeatPairs.map(pair => pair.jaccard)

function metricField(system, row, path) {
  const values = row.runs.map(run => {
    let value = run[`${system}Metrics`]
    for (const part of path) value = value?.[part]
    return value
  }).filter(value => value !== null && value !== undefined && Number.isFinite(value))
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}
function perfComparison(pathA, pathB = pathA) {
  const pairs = rows.map(row => [metricField('dsh', row, pathA), metricField('oc', row, pathB)]).filter(pair => pair[0] !== null && pair[1] !== null)
  return continuousComparison(pairs.map(pair => pair[0]), pairs.map(pair => pair[1]))
}
const perf = {
  wallMs: perfComparison(['wallMs']),
  cacheReadRatio: perfComparison(['cache', 'readRatio']),
  ttftAvgMs: perfComparison(['ttft', 'avgMs']),
  stepAvgMs: perfComparison(['stepMs', 'avgMs']),
  requests: perfComparison(['requests']),
  bashAvgMs: perfComparison(['tools', 'bash', 'avgMs']),
  writeAvgMs: perfComparison(['tools', 'write', 'avgMs']),
}


const passEquivalenceMargin = level === 'mbpp' ? 0.10 : 0.05
const stats = {
  config: { level, tasks: rows.length, repeatsPerTask: rows[0]?.runs.length ?? 0, passEquivalenceMargin },
  passRepeatLevel: binaryComparison(dshPass, ocPass, { equivalenceMargin: passEquivalenceMargin }),
  passTaskLevel: continuousComparison(dshRatePerTask, ocRatePerTask, { equivalenceMargin: passEquivalenceMargin }),
  reasoningChars: continuousComparison(dshReasoningPerTask, ocReasoningPerTask),
  toolCount: continuousComparison(
    rows.map(row => row.runs.reduce((sum, run) => sum + run.dshTools.length, 0) / row.runs.length),
    rows.map(row => row.runs.reduce((sum, run) => sum + run.ocTools.length, 0) / row.runs.length),
  ),
  traceSimilarity: { mean: traceSimilarity.reduce((sum, value) => sum + value, 0) / traceSimilarity.length },
  traceDistance: { mean: traceDistance.reduce((sum, value) => sum + value, 0) / traceDistance.length },
  toolCountDiffMean: toolCountDiff.reduce((sum, value) => sum + value, 0) / toolCountDiff.length,
  jaccardMean: jaccard.reduce((sum, value) => sum + value, 0) / jaccard.length,
  perf,
  rows,
}
const output = { runDir, stats }
writeFileSync(new URL('results.json', new URL(`${runDir}/`, import.meta.url)), JSON.stringify(output, null, 2))
if (asJson) {
  console.log(JSON.stringify(output, null, 2))
  process.exit(0)
}
console.log(JSON.stringify({
  config: stats.config,
  rates: stats.passRepeatLevel.rates,
  repeatLevel: {
    discordant: stats.passRepeatLevel.counts,
    meanDiff: stats.passRepeatLevel.meanDiff,
    ci95: stats.passRepeatLevel.ci95,
    mcnemarP: stats.passRepeatLevel.mcnemarP,
    exactBinomialP: stats.passRepeatLevel.exactBinomialP,
    tost: stats.passRepeatLevel.tost,
  },
  taskLevel: stats.passTaskLevel,
  reasoning: stats.reasoningChars,
  trace: { similarity: stats.traceSimilarity, distance: stats.traceDistance, toolCountDiffMean: stats.toolCountDiffMean, jaccard: stats.jaccardMean },
}, null, 2))
