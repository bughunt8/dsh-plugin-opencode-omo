// Paired multi-repeat experiment runner.
//   node run_exp.mjs <human-eval|mbpp> <limit> <repeats> <seedBase>
//
// Per task it runs BOTH systems `repeats` times, alternating system order
// (even repeat: dsh first, odd repeat: opencode first). Every repeat gets a
// fresh workdir per system so no artifact leaks across repeats or systems.
// Raw transcripts are saved under .runs/exp-<level>-n<limit>-r<repeats>-s<seed>.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDsh, stopDsh, runDshTask } from './dsh_runner.mjs'
import { runOpencodeTask } from './opencode_runner.mjs'
import { humanEvalPrompt, loadHumanEval, loadMbpp, mbppPrompt } from './bench_common.mjs'

const level = process.argv[2]
const limit = Number(process.argv[3] ?? 10)
const repeats = Number(process.argv[4] ?? 3)
const seedBase = Number(process.argv[5] ?? 10)
const startIndex = Number(process.argv[6] ?? 0)
if (!['human-eval', 'mbpp'].includes(level)) {
  console.error('usage: node run_exp.mjs <human-eval|mbpp> <limit> <repeats> <seedBase> [startIndex]')
  process.exit(2)
}

const outDir = new URL(`.runs/exp-${level}-n${limit}-r${repeats}-s${seedBase}/`, import.meta.url)
mkdirSync(outDir, { recursive: true })
const items = (level === 'mbpp' ? loadMbpp(limit) : loadHumanEval(limit)).slice(startIndex)
let summary = []
try {
  const existing = JSON.parse(readFileSync(new URL('summary.json', outDir), 'utf8'))
  if (Array.isArray(existing.rows)) summary = existing.rows
} catch {
  // fresh run
}

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}
function readSolution(dir) {
  try { return readFileSync(join(dir, 'solution.py'), 'utf8') } catch { return undefined }
}

await startDsh()
try {
  for (let taskIndex = 0; taskIndex < items.length; taskIndex += 1) {
    const item = items[taskIndex]
    const id = String(item.task_id ?? `task-${taskIndex}`).replaceAll('/', '_')
    const prompt = level === 'mbpp' ? mbppPrompt(item) : humanEvalPrompt(item)
    const row = { id, prompt, runs: [] }
    console.log(`[${taskIndex + 1}/${items.length}] ${id}`)
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const dshFirst = repeat % 2 === 0
      const dshDir = freshDir('omo-exp-dsh-')
      const ocDir = freshDir('omo-exp-oc-')
      const run = { repeat, dshFirst, dsh: undefined, opencode: undefined }
      const runDsh = async () => {
        try {
          const result = await runDshTask(prompt, { timeoutMs: 900_000, cwd: dshDir })
          run.dsh = { sessionId: result.sessionId, events: result.events, solution: readSolution(dshDir) }
        } catch (error) {
          run.dsh = { error: String(error) }
        }
      }
      const runOc = async () => {
        try {
          const result = await runOpencodeTask(prompt, { dangerouslySkipPermissions: true, cwd: ocDir })
          run.opencode = {
            sessionId: result.sessionId,
            events: result.events,
            exported: result.exported,
            exitCode: result.exitCode,
            solution: readSolution(ocDir),
          }
        } catch (error) {
          run.opencode = { error: String(error) }
        }
      }
      if (dshFirst) {
        await runDsh()
        await runOc()
      } else {
        await runOc()
        await runDsh()
      }
      rmSync(dshDir, { recursive: true, force: true })
      rmSync(ocDir, { recursive: true, force: true })
      row.runs.push(run)
      console.log(`  r${repeat + 1}/${repeats} dsh=${run.dsh.error ? 'ERR' : 'ok'} oc=${run.opencode.error ? 'ERR' : 'ok'}`)
    }
    writeFileSync(new URL(`${id}.json`, outDir), JSON.stringify(row, null, 2))
    summary.push({ id, repeats })
  }
} finally {
  await stopDsh()
}
writeFileSync(new URL('summary.json', outDir), JSON.stringify({ level, limit, repeats, seedBase, rows: summary }, null, 2))
console.log('done', new URL('.', outDir).pathname)
