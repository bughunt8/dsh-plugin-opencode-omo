// A/A noise-floor experiment: run the SAME system twice per task to measure
// the benchmark's intrinsic variance before interpreting an A/B difference.
//   node run_aa.mjs <human-eval|mbpp> <limit> <repeats> <dsh|opencode> <seedBase>
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDsh, stopDsh, runDshTask } from './dsh_runner.mjs'
import { runOpencodeTask } from './opencode_runner.mjs'
import { humanEvalPrompt, loadHumanEval, loadMbpp, mbppPrompt } from './bench_common.mjs'

const level = process.argv[2]
const limit = Number(process.argv[3] ?? 10)
const repeats = Number(process.argv[4] ?? 3)
const system = process.argv[5] ?? 'dsh'
const seedBase = Number(process.argv[6] ?? 50)
const startIndex = Number(process.argv[7] ?? 0)
if (!['human-eval', 'mbpp'].includes(level) || !['dsh', 'opencode'].includes(system)) {
  console.error('usage: node run_aa.mjs <human-eval|mbpp> <limit> <repeats> <dsh|opencode> <seedBase> [startIndex]')
  process.exit(2)
}
const outDir = new URL(`.runs/aa-${system}-${level}-n${limit}-r${repeats}-s${seedBase}/`, import.meta.url)
mkdirSync(outDir, { recursive: true })
const items = (level === 'mbpp' ? loadMbpp(limit) : loadHumanEval(limit)).slice(startIndex)

const runOne = async (prompt, dir) => {
  if (system === 'dsh') {
    const result = await runDshTask(prompt, { timeoutMs: 900_000, cwd: dir })
    return { sessionId: result.sessionId, events: result.events, solution: readFileSafe(join(dir, 'solution.py')) }
  }
  const result = await runOpencodeTask(prompt, { dangerouslySkipPermissions: true, cwd: dir })
  return {
    sessionId: result.sessionId,
    events: result.events,
    exported: result.exported,
    exitCode: result.exitCode,
    solution: readFileSafe(join(dir, 'solution.py')),
  }
}
function readFileSafe(path) {
  try { return readFileSync(path, 'utf8') } catch { return undefined }
}

if (system === 'dsh') await startDsh()
try {
  for (let taskIndex = 0; taskIndex < items.length; taskIndex += 1) {
    const item = items[taskIndex]
    const id = String(item.task_id ?? `task-${taskIndex}`).replaceAll('/', '_')
    const prompt = level === 'mbpp' ? mbppPrompt(item) : humanEvalPrompt(item)
    const row = { id, prompt, runs: [] }
    console.log(`[${taskIndex + 1}/${items.length}] ${id}`)
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const dirA = mkdtempSync(join(tmpdir(), 'omo-aa-a-'))
      const dirB = mkdtempSync(join(tmpdir(), 'omo-aa-b-'))
      const run = { repeat, a: undefined, b: undefined }
      try {
        run.a = await runOne(prompt, dirA)
      } catch (error) {
        run.a = { error: String(error) }
      }
      try {
        run.b = await runOne(prompt, dirB)
      } catch (error) {
        run.b = { error: String(error) }
      }
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
      row.runs.push(run)
      console.log(`  r${repeat + 1}/${repeats} a=${run.a.error ? 'ERR' : 'ok'} b=${run.b.error ? 'ERR' : 'ok'}`)
    }
    writeFileSync(new URL(`${id}.json`, outDir), JSON.stringify(row, null, 2))
  }
} finally {
  if (system === 'dsh') await stopDsh()
}
writeFileSync(new URL('summary.json', outDir), JSON.stringify({ level, limit, repeats, system, seedBase }, null, 2))
console.log('done', new URL('.', outDir).pathname)
