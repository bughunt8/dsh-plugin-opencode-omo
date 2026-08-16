// L1 probe runner: same instruction-fidelity probes on both systems, repeated
// with alternating order and fresh workdirs.
//   node run_probes.mjs <repeats> <seedBase>
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDsh, stopDsh, runDshTask } from './dsh_runner.mjs'
import { runOpencodeTask } from './opencode_runner.mjs'

const repeats = Number(process.argv[2] ?? 3)
const seedBase = Number(process.argv[3] ?? 100)
const probes = JSON.parse(readFileSync(new URL('./probes/omo-probes.json', import.meta.url), 'utf8'))
const outDir = new URL(`.runs/probes-r${repeats}-s${seedBase}/`, import.meta.url)
mkdirSync(outDir, { recursive: true })

function freshDir() {
  return mkdtempSync(join(tmpdir(), 'omo-probe-'))
}
function readFileSafe(path) {
  try { return readFileSync(path, 'utf8') } catch { return undefined }
}
function dshFinalText(run) {
  return run?.events?.filter(event => event.type === 'assistant/message').at(-1)
    ?.data?.message?.content?.filter(block => block.type === 'text').map(block => block.text ?? '').join('') ?? ''
}
function ocFinalText(run) {
  return run?.events?.filter(event => event.type === 'text').map(event => event.part?.text ?? '').at(-1) ?? ''
}
function dshTools(run) {
  return run?.events?.filter(event => event.type === 'tool/call').map(event => event.data?.name) ?? []
}
function ocTools(run) {
  return run?.events?.filter(event => event.type === 'tool_use').map(event => event.part?.tool) ?? []
}

await startDsh()
try {
  for (const probe of probes) {
    const row = { id: probe.id, probe, runs: [] }
    console.log(`probe ${probe.id}`)
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const dshDir = freshDir()
      const ocDir = freshDir()
      const dshFirst = repeat % 2 === 0
      const run = { repeat, dshFirst, dsh: undefined, opencode: undefined }
      const runDsh = async () => {
        try {
          const result = await runDshTask(probe.prompt, { timeoutMs: 300_000, cwd: dshDir })
          run.dsh = {
            sessionId: result.sessionId,
            events: result.events,
            finalText: dshFinalText(result),
            tools: dshTools(result),
            file: probe.file === null ? undefined : readFileSafe(join(dshDir, probe.file)),
          }
        } catch (error) {
          run.dsh = { error: String(error) }
        }
      }
      const runOc = async () => {
        try {
          const result = await runOpencodeTask(probe.prompt, { dangerouslySkipPermissions: true, cwd: ocDir })
          run.opencode = {
            sessionId: result.sessionId,
            events: result.events,
            exported: result.exported,
            finalText: ocFinalText(result),
            tools: ocTools(result),
            file: probe.file === null ? undefined : readFileSafe(join(ocDir, probe.file)),
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
    writeFileSync(new URL(`${probe.id}.json`, outDir), JSON.stringify(row, null, 2))
  }
} finally {
  await stopDsh()
}
writeFileSync(new URL('summary.json', outDir), JSON.stringify({ probes: probes.length, repeats, seedBase }, null, 2))
console.log('done', new URL('.', outDir).pathname)
