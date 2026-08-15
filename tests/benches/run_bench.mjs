// Run one bench level through BOTH systems with dpsk v4 pro and save raw
// transcripts under tests/benches/.runs. Run:
//   DSH_ROOT=... DSH_HOME_BENCH=... OPENCODE_CONFIG_HOME=... DEEPSEEK_API_KEY=... \
//   node run_bench.mjs <level> <limit> [seed]
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDsh, stopDsh, runDshTask } from './dsh_runner.mjs'
import { runOpencodeTask } from './opencode_runner.mjs'
import { humanEvalPrompt, loadHumanEval, loadMbpp, mbppPrompt } from './bench_common.mjs'

const level = process.argv[2] ?? 'human-eval'
const limit = Number(process.argv[3] ?? 3)
const seed = Number(process.argv[4] ?? 1)
const runRoot = new URL('.runs/', import.meta.url)
const outDir = new URL(`.runs/${level}-seed${seed}/`, import.meta.url)
mkdirSync(outDir, { recursive: true })

const items = level === 'mbpp' ? loadMbpp(limit) : loadHumanEval(limit)
const summarize = []
await startDsh()
try {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const id = String(item.task_id ?? `task-${index}`).replaceAll('/', '_')
    const safeId = encodeURIComponent(id)
    const prompt = level === 'mbpp' ? mbppPrompt(item) : humanEvalPrompt(item)
    console.log(`[${index + 1}/${items.length}] ${id}`)
    const workdir = mkdtempSync(join(tmpdir(), 'omo-bench-task-'))
    const readSolution = () => {
      try { return readFileSync(join(workdir, 'solution.py'), 'utf8') } catch { return undefined }
    }
    const row = { id, prompt, dsh: undefined, opencode: undefined }
    try {
      const dsh = await runDshTask(prompt, { timeoutMs: 900_000, cwd: workdir })
      row.dsh = { sessionId: dsh.sessionId, events: dsh.events, solution: readSolution() }
    } catch (error) {
      row.dsh = { error: String(error) }
    }
    try {
      const oc = await runOpencodeTask(prompt, { dangerouslySkipPermissions: true, cwd: workdir })
      row.opencode = { sessionId: oc.sessionId, events: oc.events, exported: oc.exported, exitCode: oc.exitCode, solution: readSolution() }
    } catch (error) {
      row.opencode = { error: String(error) }
    }
    rmSync(workdir, { recursive: true, force: true })
    writeFileSync(new URL(`${safeId}.json`, outDir), JSON.stringify(row, null, 2))
    summarize.push({
      id: safeId,
      dsh: row.dsh.error ? 'error' : 'ok',
      opencode: row.opencode?.error ? 'error' : 'ok',
    })
    console.log(JSON.stringify(summarize.at(-1)))
  }
} finally {
  await stopDsh()
}
writeFileSync(new URL('summary.json', outDir), JSON.stringify({ level, limit, seed, rows: summarize }, null, 2))
console.log('done', new URL('.', outDir).pathname)
