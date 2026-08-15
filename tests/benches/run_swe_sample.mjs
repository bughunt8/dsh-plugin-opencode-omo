// Run one SWE-bench-verified-mini instance through both systems in the same
// checked-out repo (reset between runs). Saves transcript + git diff.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { startDsh, stopDsh, runDshTask } from './dsh_runner.mjs'
import { runOpencodeTask } from './opencode_runner.mjs'

const instanceId = process.argv[2]
const GIT = process.env.GIT_BIN ?? 'git'
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
const prompt = [
  'You are fixing a real bug in the checked-out repository. Work in the repository root.',
  'Read the problem statement, inspect relevant files/tests, make the minimal code change, and run the relevant tests until they pass.',
  '',
  'PROBLEM STATEMENT:',
  item.problem_statement,
  '',
  'FAIL_TO_PASS tests: ' + item.FAIL_TO_PASS,
].join('\n')

await startDsh()
try {
  resetAndApplyTestPatch()
  const dsh = await runDshTask(prompt, { cwd: repo, timeoutMs: 1_200_000 })
  const dshDiff = git(['diff'])
  writeFileSync(new URL('dsh.json', outDir), JSON.stringify({ sessionId: dsh.sessionId, events: dsh.events, diff: dshDiff }))
  console.log('dsh done', dshDiff.length, 'diff chars')

  resetAndApplyTestPatch()
  const oc = await runOpencodeTask(prompt, { cwd: repo, dangerouslySkipPermissions: true })
  const ocDiff = git(['diff'])
  writeFileSync(new URL('opencode.json', outDir), JSON.stringify({ sessionId: oc.sessionId, events: oc.events, exported: oc.exported, diff: ocDiff }))
  console.log('opencode done', ocDiff.length, 'diff chars')
} finally {
  await stopDsh()
}
