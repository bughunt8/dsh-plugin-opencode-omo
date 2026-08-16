// Run one SWE-bench-verified-mini instance through both systems in the same
// checked-out repo (reset between runs). Each system gets its own Python venv
// so `pip install -e .` performed by one agent cannot leak into the other's
// environment (a shared interpreter distorts the tool-timing comparison).
// Saves transcript + git diff.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startDsh, stopDsh, runDshTask } from './dsh_runner.mjs'
import { runOpencodeTask } from './opencode_runner.mjs'

const instanceId = process.argv[2]
const GIT = process.env.GIT_BIN ?? 'git'
const PYTHON = process.env.PYTHON_BIN ?? 'python3'
const jsonl = readFileSync(new URL('.data/swe-bench-verified-mini.jsonl', import.meta.url), 'utf8')
const item = jsonl.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(row => row.instance_id === instanceId)
if (!item) throw new Error(`instance not found: ${instanceId}`)
const repo = process.env.SWE_REPO_DIR ?? new URL(`.data/swe-repo-${instanceId}`, import.meta.url).pathname
const outDir = new URL(`.runs/swe-${instanceId}/`, import.meta.url)
mkdirSync(outDir, { recursive: true })

function git(args) {
  return execFileSync(GIT, args, { cwd: repo, encoding: 'utf8' }).trim()
}
function resetAndApplyTestPatch() {
  git(['reset', '--hard', item.base_commit])
  git(['clean', '-fd'])
  writeFileSync(`${repo}/.swe-test.patch`, item.test_patch)
  execFileSync(GIT, ['apply', '.swe-test.patch'], { cwd: repo, encoding: 'utf8' })
}

/** Fresh per-system venv with the repo installed editable (same starting env for both). */
function ensureVenv(system) {
  const root = process.env.SWE_VENV_ROOT ?? new URL('.data/', import.meta.url).pathname
  const dir = join(root, `venv-${instanceId}-${system}`)
  if (!existsSync(join(dir, 'bin', 'python'))) {
    // --system-site-packages reuses the machine's already-installed test stack
    // (pytest/docutils/…) so the bench does not depend on the network at all;
    // the editable repo install is still isolated into this venv.
    execFileSync(PYTHON, ['-m', 'venv', '--system-site-packages', dir], { stdio: 'inherit' })
    execFileSync(join(dir, 'bin', 'pip'), ['install', '--no-deps', '-e', '.'], { cwd: repo, stdio: 'inherit' })
  }
  return dir
}

/** Re-run FAIL_TO_PASS under the system's own venv; this is the scored outcome. */
function verifyFailToPass(venv) {
  const tests = JSON.parse(item.FAIL_TO_PASS)
  try {
    const output = execFileSync(
      join(venv, 'bin', 'python'),
      ['-m', 'pytest', '-q', ...tests],
      { cwd: repo, encoding: 'utf8', timeout: 600_000 },
    )
    return { pass: true, output: output.slice(-4000) }
  } catch (error) {
    return {
      pass: false,
      output: `${String(error.stdout ?? '')}\n${String(error.stderr ?? '')}`.slice(-4000),
    }
  }
}

const prompt = [
  'You are fixing a real bug in the checked-out repository. Work in the repository root.',
  'Read the problem statement, inspect relevant files/tests, make the minimal code change, and run the relevant tests until they pass.',
  '',
  'PROBLEM STATEMENT:',
  item.problem_statement,
  '',
  'FAIL_TO_PASS tests: ' + item.FAIL_TO_PASS,
].join('\n')

const originalPath = process.env.PATH
try {
  const dshVenv = ensureVenv('dsh')
  process.env.PATH = `${dshVenv}/bin:${originalPath}`
  await startDsh()
  try {
    resetAndApplyTestPatch()
    const dsh = await runDshTask(prompt, { cwd: repo, timeoutMs: 1_200_000 })
    const dshDiff = git(['diff'])
    const dshVerified = verifyFailToPass(dshVenv)
    writeFileSync(new URL('dsh.json', outDir), JSON.stringify({
      sessionId: dsh.sessionId, events: dsh.events, diff: dshDiff, verified: dshVerified, venv: dshVenv,
    }))
    console.log('dsh done', dshDiff.length, 'diff chars; fail_to_pass', dshVerified.pass)
  } finally {
    await stopDsh()
  }

  const ocVenv = ensureVenv('opencode')
  process.env.PATH = `${ocVenv}/bin:${originalPath}`
  resetAndApplyTestPatch()
  const oc = await runOpencodeTask(prompt, { cwd: repo, dangerouslySkipPermissions: true })
  const ocDiff = git(['diff'])
  const ocVerified = verifyFailToPass(ocVenv)
  writeFileSync(new URL('opencode.json', outDir), JSON.stringify({
    sessionId: oc.sessionId, events: oc.events, exported: oc.exported, diff: ocDiff, verified: ocVerified, venv: ocVenv,
  }))
  console.log('opencode done', ocDiff.length, 'diff chars; fail_to_pass', ocVerified.pass)
} finally {
  process.env.PATH = originalPath
}
