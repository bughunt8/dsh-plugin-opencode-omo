// Headless dsh runner for the opencode-omo equivalence bench.
// Starts an isolated dsh web profile on its own port and drives it through the
// HTTP RPC surface. No absolute machine paths or secrets are hardcoded.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DSH_ROOT = process.env.DSH_ROOT
const DSH_HOME_BENCH = process.env.DSH_HOME_BENCH
const DSH_PROFILE = process.env.DSH_PROFILE ?? 'omo-bench'
const DSH_PORT = Number(process.env.DSH_PORT ?? 0)
const HOST = '127.0.0.1'
const BIN = join(DSH_ROOT, 'apps', 'cli', 'lib', 'bin.js')

if (!DSH_ROOT || !DSH_HOME_BENCH) {
  console.error('DSH_ROOT and DSH_HOME_BENCH env vars are required')
  process.exit(2)
}

let child
let port

const api = async (method, payload, rpcId = `${method}-${Date.now()}-${Math.random()}`) => {
  const res = await fetch(`http://${HOST}:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  if (!res.ok) throw new Error(`${method} HTTP ${res.status}`)
  return res.json()
}

async function waitReady(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await api('host.describe', {})
      if (res.result?.ok) return res.result.value
    } catch {
      // server not up yet
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('dsh web server did not become ready')
}

export async function startDsh() {
  port = DSH_PORT
  child = spawn(process.execPath, [BIN, '--profile', DSH_PROFILE, '--host', HOST, '--port', String(port)], {
    cwd: DSH_ROOT,
    env: { ...process.env, DSH_HOME: DSH_HOME_BENCH },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  const ready = await waitReady()
  if (port === 0) {
    // host.describe has no port; parse the printed URL from stderr
    const match = stderr.match(/http:\/\/[^:\n]+:(\d+)/)
    if (match) port = Number(match[1])
    else throw new Error(`cannot discover port: ${stderr}`)
  }
  return { child, port, describe: ready }
}

export async function stopDsh() {
  if (child && !child.killed) child.kill('SIGTERM')
}

export async function runDshTask(task, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const create = await api('session.create', { cwd, agentPreset: 'opencode-omo' })
  if (!create.result?.ok) throw new Error(JSON.stringify(create))
  const sessionId = create.result.value.sessionId
  const prompt = await api('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: task }],
  })
  if (!prompt.result?.ok) throw new Error(JSON.stringify(prompt))
  const deadline = Date.now() + (options.timeoutMs ?? 600000)
  for (;;) {
    const list = await api('session.list', {})
    const item = list.result?.value?.items?.find(entry => entry.sessionId === sessionId)
    if (item && !item.running && !item.blank) break
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${sessionId}`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const exportUrl = `http://${HOST}:${port}/api/session.export?sessionId=${encodeURIComponent(sessionId)}`
  const res = await fetch(exportUrl)
  if (!res.ok) throw new Error(`session.export HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const dir = mkdtempSync(join(tmpdir(), 'dsh-export-'))
  const zip = join(dir, 'session.zip')
  writeFileSync(zip, bytes)
  mkdirSync(join(dir, 'out'), { recursive: true })
  const py = spawn('python3', ['-m', 'zipfile', '-e', zip, join(dir, 'out')], { stdio: 'ignore' })
  await new Promise((resolve, reject) => { py.on('exit', code => code === 0 ? resolve() : reject(new Error(`zip extract exit ${code}`))); py.on('error', reject) })
  const files = readdirSync(join(dir, 'out'))
  const events = files.flatMap(file => readFileSync(join(dir, 'out', file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)))
  rmSync(dir, { recursive: true, force: true })
  return { sessionId, events }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const task = process.argv.slice(2).join(' ')
  if (!task) { console.error('usage: dsh_runner.mjs <task>'); process.exit(2) }
  const server = await startDsh()
  try {
    const run = await runDshTask(task)
    const assistant = run.events.filter(event => event.type === 'assistant/message')
    console.log(JSON.stringify({
      sessionId: run.sessionId,
      finalText: assistant.at(-1)?.data?.message?.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? '',
      toolCalls: run.events.filter(event => event.type === 'tool/call').map(event => event.data.name),
      reasoningChars: run.events
        .flatMap(event => event.type === 'assistant/message'
          ? (event.data.message?.content ?? []).filter(b => b.type === 'reasoning').map(b => b.text)
          : event.type === 'assistant/chunk' && event.data.chunk?.type === 'reasoning-delta' ? [event.data.chunk.text] : [])
        .reduce((n, text) => n + (text?.length ?? 0), 0),
    }, null, 2))
  } finally {
    await stopDsh()
  }
}
