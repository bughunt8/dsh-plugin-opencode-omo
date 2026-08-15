// Evaluate saved bench transcripts: pass/fail on reference tests plus behavior
// metrics (reasoning exposure, tool-call sequences, final-answer similarity).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dshTrace, extractPythonCode, loadHumanEval, loadMbpp, opencodeTrace, tokenJaccard,
} from './bench_common.mjs'

const level = process.argv[2] ?? 'human-eval'
const seed = Number(process.argv[3] ?? 1)
const dir = fileURLToPath(new URL(`.runs/${level}-seed${seed}/`, import.meta.url))
const files = readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'summary.json').sort()
const dataset = level === 'mbpp' ? loadMbpp(files.length) : loadHumanEval(files.length)

function runPython(source) {
  return new Promise(resolve => {
    const dir = mkdtempSync(join(tmpdir(), 'omo-eval-'))
    const file = join(dir, 'solution.py')
    writeFileSync(file, source)
    const child = spawn('python3', [file], { timeout: 30_000 })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', () => resolve({ ok: false, detail: 'spawn failed' }))
    child.on('exit', code => {
      rmSync(dir, { recursive: true, force: true })
      resolve({ ok: code === 0, code, stdout, stderr })
    })
  })
}

function testSource(item, solution, finalText) {
  const code = solution && solution.trim() !== ''
    ? solution
    : extractPythonCode(finalText ?? '')
  if (code === undefined || code.trim() === '') return undefined
  const name = item.entry_point
  const tests = level === 'mbpp'
    ? item.test_list.join('\n')
    : item.test
  return `${code}\n\nfrom solution import ${name}\n${tests}\nprint('ALL_TESTS_PASSED')`
}

const rows = []
for (const file of files) {
  const row = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const item = dataset.find(entry => String(entry.task_id ?? `task-${files.indexOf(file)}`) === String(row.id))
    ?? dataset[files.indexOf(file)]
  const dsh = row.dsh?.error ? undefined : dshTrace(row.dsh)
  const oc = row.opencode?.error ? undefined : opencodeTrace(row.opencode)
  const ds = dsh && testSource(item, row.dsh.solution, dsh.finalText)
  const os = oc && testSource(item, row.opencode.solution, oc.finalText)
  const dshPass = ds ? (await runPython(ds)).ok : false
  const ocPass = os ? (await runPython(os)).ok : false
  rows.push({
    id: row.id,
    dshPass,
    opencodePass: ocPass,
    dshReasoningChars: dsh?.reasoningChars ?? 0,
    opencodeReasoningChars: oc?.reasoningChars ?? 0,
    dshTools: dsh?.toolCalls.map(call => call.name) ?? [],
    opencodeTools: oc?.toolCalls.map(call => call.name) ?? [],
    finalTextJaccard: dsh && oc ? tokenJaccard(dsh.finalText, oc.finalText) : null,
  })
}
const summary = {
  level,
  seed,
  n: rows.length,
  dshPassRate: rows.filter(row => row.dshPass).length / rows.length,
  opencodePassRate: rows.filter(row => row.opencodePass).length / rows.length,
  agreement: rows.filter(row => row.dshPass === row.opencodePass).length / rows.length,
  avgFinalTextJaccard: rows.reduce((n, row) => n + (row.finalTextJaccard ?? 0), 0) / rows.length,
  rows,
}
console.log(JSON.stringify(summary, null, 2))
