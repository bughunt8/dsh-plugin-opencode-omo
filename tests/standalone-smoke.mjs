#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratch = mkdtempSync(join(tmpdir(), 'omo-standalone-'))
const runtime = join(scratch, 'runtime')
const home = join(scratch, 'home')
const workspace = join(scratch, 'workspace with spaces')
const env = {
  PATH: '/usr/bin:/bin',
  HOME: home,
  DSH_HOME: join(home, '.dsh'),
  DSH_TELEMETRY_DISABLED: '1',
  npm_config_cache: join(scratch, 'npm-cache'),
  OMO_SMOKE_RUNTIME: runtime,
}
const packageName = '@royenheart/dsh-plugin-opencode-omo'
const keep = process.argv.includes('--keep')
let processHandle
let processExit
let ended = false
let output = ''
let errors = ''
let socket
const redact = value => String(value).replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[REDACTED]')

function command(binary, args, cwd = scratch) {
  try {
    return execFileSync(binary, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 })
  } catch (error) {
    throw new Error(`${binary} failed: ${redact(error.stderr ?? error.message)}`)
  }
}
async function until(check, label, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (ended) throw new Error(`Harness exited before ${label}: ${redact(errors).slice(-5000)}`)
    const result = await check()
    if (result) return result
    await delay(100)
  }
  throw new Error(`Timed out: ${label}: ${redact(errors).slice(-5000)}`)
}

try {
  for (const directory of [runtime, home, workspace]) mkdirSync(directory, { mode: 0o700 })
  const [packed] = JSON.parse(command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], source))
  const artifact = join(scratch, packed.filename)
  const inventory = new Set(packed.files.map(file => file.path))
  for (const file of ['install.py', 'lib/index.js', 'lib/client.js', 'lib/types/client/index.d.ts', 'NOTICE.md', 'presets/opencode-omo/preset.yml']) {
    assert.ok(inventory.has(file), `missing packed file ${file}`)
  }
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({
    private: true,
    dependencies: { '@deepseek-ai/dsh': '0.1.2-rc.1', [packageName]: `file:${artifact}` },
  }))
  console.log('Installing stock Harness and the packed OMO artifact in an isolated runtime...')
  command('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], runtime)
  const require = createRequire(join(runtime, 'package.json'))
  const installed = join(runtime, 'node_modules', packageName)
  assert.ok(!realpathSync(installed).startsWith(source), 'installed package still links to the source checkout')
  const installer = join(installed, 'install.py')
  command('python3', [installer, 'install', '--home', env.DSH_HOME])
  const profile = join(env.DSH_HOME, 'profiles/web')
  const manifestBefore = readFileSync(join(profile, 'package.json'), 'utf8')
  command('python3', [installer, 'install', '--home', env.DSH_HOME])
  assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), manifestBefore)
  assert.equal(realpathSync(join(profile, 'node_modules', packageName)), installed)
  console.log('PASS: packed install and repeated install; no sibling checkouts or dsh-env required')

  // Configure only the local test model. Keep the installer's actual profile,
  // package links and preset publication intact.
  const yaml = require('js-yaml')
  writeFileSync(join(profile, 'cordis.patch.yml'), yaml.dump([
    { id: 'llm-deepseek', disabled: true },
    { id: 'llm-pi-ai', disabled: true },
    { id: 'session-title-llm', disabled: true },
    { id: 'agent-default-model', config: { provider: 'omo-test', model: 'local' } },
    { insert: [{ id: 'omo-test-model', name: join(source, 'tests/fixtures/standalone-model.mjs') }] },
  ]))
  processHandle = spawn(process.execPath, [join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'web', '--no-open', '--port', '0'], {
    cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  processExit = once(processHandle, 'exit')
  processHandle.on('exit', () => { ended = true })
  processHandle.on('error', error => { ended = true; errors += error.message })
  processHandle.stdout.on('data', data => { output += data })
  processHandle.stderr.on('data', data => { errors += data })
  const startup = await until(() => output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0], 'server boot')
  const origin = new URL(startup).origin
  const authorization = await fetch(startup, { redirect: 'manual' })
  assert.equal(authorization.status, 303)
  const cookie = authorization.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  async function rpc(method, args) {
    const response = await fetch(`${origin}/api/${method}`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(response.status, 200, method)
    const { result } = await response.json()
    assert.equal(result.ok, true, `${method}: ${JSON.stringify(result.error)}`)
    return result.value
  }
  const catalog = await rpc('session/modelCatalog', {})
  assert.deepEqual(catalog.routableProviders, ['omo-test'])
  const rolesResponse = await fetch(`${origin}/plugins/${packageName}/roles`, { headers: { Cookie: cookie } })
  assert.equal(rolesResponse.status, 200)
  assert.ok((await rolesResponse.json()).roles.some(role => role.id === 'sisyphus'))
  const { sessionId, agentPreset } = await rpc('session/create', { request: { cwd: workspace, agentPreset: 'opencode-omo' } })
  assert.equal(agentPreset, 'opencode-omo')
  await rpc('session/selectModel', { request: { sessionId, provider: 'omo-test', model: 'local' } })
  const { WebSocket } = require('ws')
  socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/remote.mux`, { headers: { Cookie: cookie } })
  const events = []
  let ready = false
  let socketError
  socket.on('error', error => { socketError = error })
  socket.on('message', data => {
    const message = JSON.parse(data.toString())
    if (message.type === 'error') socketError = new Error(JSON.stringify(message.error))
    if (message.value?.type === 'snapshot') ready = true
    if (message.value?.type === 'event') events.push(message.value.event)
  })
  await until(() => { if (socketError) throw socketError; return socket.readyState === WebSocket.OPEN }, 'event connection')
  socket.send(JSON.stringify({ type: 'open', streamId: 'standalone', endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'session', sessionId } } } } }))
  await until(() => ready, 'event snapshot')
  for (let turn = 1; turn <= 2; turn++) {
    const offset = events.length
    await rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Reply with the local marker.' }] } })
    const end = await until(() => {
      if (socketError) throw socketError
      return events.slice(offset).find(event => event.type === 'turn/end')
    }, `turn ${turn}`)
    assert.equal(end.data.reason.kind, 'completed', JSON.stringify(end.data.reason))
    const messages = events.slice(offset).filter(event => event.type === 'assistant/message')
    assert.ok(messages.some(event => event.data.message.content.some(block => block.text === 'OMO_STANDALONE_OK')))
    console.log(`PASS: standalone OMO turn ${turn} completed through real Harness`)
  }
  command('python3', [installer, 'uninstall', '--home', env.DSH_HOME])
  assert.ok(!JSON.parse(readFileSync(join(profile, 'package.json'))).dsh.profile.bundles.includes(packageName))
  const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex')
  console.log(JSON.stringify({ result: 'passed', artifact, sha256, runtime, home, turns: 2, kept: keep }))
} finally {
  socket?.terminate()
  if (processHandle?.pid && !ended) {
    try { process.kill(-processHandle.pid, 'SIGTERM') } catch {}
    await Promise.race([processExit, delay(5000, undefined, { ref: false })])
    if (!ended) {
      try { process.kill(-processHandle.pid, 'SIGKILL') } catch {}
      await processExit
    }
  }
  if (!keep) rmSync(scratch, { recursive: true, force: true })
  else console.log(`Verification files: ${scratch}`)
}
