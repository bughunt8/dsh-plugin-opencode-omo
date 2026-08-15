// opencode + oh-my-openagent runner for the equivalence bench.
// Uses an isolated XDG_CONFIG_HOME so the machine's normal opencode config is
// never mutated. No secrets are hardcoded: DEEPSEEK_API_KEY comes from the env.
import { spawn } from 'node:child_process'

const OPENCODE_BIN = process.env.OPENCODE_BIN ?? 'opencode'
const CONFIG_HOME = process.env.OPENCODE_CONFIG_HOME
const MODEL = process.env.BENCH_MODEL ?? 'dpsk/deepseek-v4-pro'
const AGENT = process.env.BENCH_OPMO_AGENT ?? 'Sisyphus - ultraworker'

if (!CONFIG_HOME) {
  console.error('OPENCODE_CONFIG_HOME env var is required')
  process.exit(2)
}

function opencodeEnv() {
  return { ...process.env, XDG_CONFIG_HOME: CONFIG_HOME }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: opencodeEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('exit', code => resolve({ code, stdout, stderr }))
    child.on('error', reject)
  })
}

export async function runOpencodeTask(task, options = {}) {
  const dir = options.cwd ?? process.cwd()
  const args = ['run', '--format', 'json', '--thinking', '--agent', AGENT, '-m', MODEL]
  if (options.dangerouslySkipPermissions) args.push('--dangerously-skip-permissions')
  args.push(task)
  const result = await run(OPENCODE_BIN, args, { cwd: dir })
  const events = result.stdout.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line) } catch { return { type: 'unparseable', line } }
  })
  const lastEvent = events.at(-1)
  const sessionId = lastEvent?.sessionID
  let exported
  if (sessionId) {
    const exp = await run(OPENCODE_BIN, ['export', sessionId], { cwd: dir })
    try { exported = JSON.parse(exp.stdout) } catch { exported = undefined }
  }
  return { exitCode: result.code, stderr: result.stderr, events, sessionId, exported }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const task = process.argv.slice(2).join(' ')
  if (!task) { console.error('usage: opencode_runner.mjs <task>'); process.exit(2) }
  const run = await runOpencodeTask(task)
  const textParts = run.events.filter(e => e.type === 'text').map(e => e.part?.text ?? '')
  console.log(JSON.stringify({
    exitCode: run.exitCode,
    sessionId: run.sessionId,
    finalText: textParts.at(-1) ?? '',
    eventTypes: [...new Set(run.events.map(e => e.type))],
    reasoningParts: run.events.filter(e => e.type === 'reasoning').length,
    toolParts: run.exported?.messages?.flatMap(m => m.parts ?? []).filter(p => p.type === 'tool' || p.type === 'tool-invocation').length ?? 0,
  }, null, 2))
}
