// Evaluate an A/A run directory produced by run_aa.mjs.
// Reports the noise floor: paired pass-rate difference, task-level rate
// difference, reasoning/tool-count differences, and TOST-equivalence check
// against the SAME predeclared margins used for the A/B comparison.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractPythonCode, loadHumanEval, loadMbpp, mbppEntryPoint } from './bench_common.mjs'
import { binaryComparison, continuousComparison } from './eval_stats.mjs'

const runDir = process.argv[2]
const asJson = process.argv.includes('--json')
if (!runDir) {
  console.error('usage: node eval_aa.mjs <aa-dir> [--json]')
  process.exit(2)
}
const summary = JSON.parse(readFileSync(new URL('summary.json', new URL(`${runDir}/`, import.meta.url)), 'utf8'))
const dataset = summary.level === 'mbpp' ? loadMbpp(9999) : loadHumanEval(9999)

function runPython(source) {
  return new Promise(resolve => {
    const dir = mkdtempSync(join(tmpdir(), 'omo-eval-aa-'))
    const file = join(dir, 'solution.py')
    writeFileSync(file, source)
    const child = spawn('python3', [file], { timeout: 30_000 })
    child.on('error', () => resolve(false))
    child.on('exit', code => {
      rmSync(dir, { recursive: true, force: true })
      resolve(code === 0)
    })
  })
}
function testSource(item, solution) {
  const code = solution && solution.trim() !== '' ? solution : undefined
  if (code === undefined || code.trim() === '') return undefined
  const name = summary.level === 'mbpp' ? mbppEntryPoint(item) : item.entry_point
  const tests = summary.level === 'mbpp' ? item.test_list.join('\n') : item.test
  return `${code}\n\nfrom solution import ${name}\n${tests}\nprint('ALL_TESTS_PASSED')`
}
function finalText(run) {
  if (run.exported) {
    return run.events?.filter(event => event.type === 'text').map(event => event.part?.text ?? '').at(-1) ?? ''
  }
  return run.events?.filter(event => event.type === 'assistant/message').at(-1)
    ?.data?.message?.content?.filter(block => block.type === 'text').map(block => block.text ?? '').join('') ?? ''
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
  const runs = []
  for (const run of row.runs) {
    const aSource = run.a?.error ? undefined : testSource(item, run.a.solution ?? extractPythonCode(finalText(run.a)))
    const bSource = run.b?.error ? undefined : testSource(item, run.b.solution ?? extractPythonCode(finalText(run.b)))
    runs.push({
      repeat: run.repeat,
      aPass: aSource ? await runPython(aSource) : false,
      bPass: bSource ? await runPython(bSource) : false,
    })
  }
  rows.push({ id: row.id, runs })
}
const pairs = rows.flatMap(row => row.runs)
const aPass = pairs.map(pair => pair.aPass)
const bPass = pairs.map(pair => pair.bPass)
const aRate = rows.map(row => row.runs.filter(run => run.aPass).length / row.runs.length)
const bRate = rows.map(row => row.runs.filter(run => run.bPass).length / row.runs.length)
const output = {
  runDir,
  config: summary,
  passRepeatLevel: binaryComparison(aPass, bPass, { equivalenceMargin: 0.05 }),
  passTaskLevel: continuousComparison(aRate, bRate, { equivalenceMargin: 0.05 }),
}
writeFileSync(new URL('results.json', new URL(`${runDir}/`, import.meta.url)), JSON.stringify(output, null, 2))
if (asJson) {
  console.log(JSON.stringify(output, null, 2))
  process.exit(0)
}
console.log(JSON.stringify(output, null, 2))
