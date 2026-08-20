/**
 * Pure-function tests for the escalating-bash shim: availability gate, EROFS
 * denial heuristic, run-result rendering, and the escalation argument
 * contract. The shim wiring itself is a thin defineTool wrapper around the
 * registry's persistent bash (the same pattern tool-surface.spec covers).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEscalationArgs } from '@deepseek-ai/dsh-sandbox'
import {
  ESCALATION_GUIDANCE,
  ESCALATION_PARAMETERS,
  escalationAvailableFor,
  name,
  outputLooksSandboxDenied,
  renderShellRun,
} from '../presets/opencode-omo/escalating-bash.mjs'

test('module identity', () => {
  assert.equal(name, 'opencode-omo-escalating-bash')
})

test('escalationAvailableFor requires a confining executor and the policy service', () => {
  assert.equal(escalationAvailableFor(undefined, undefined), false)
  assert.equal(escalationAvailableFor({ sandboxMode: undefined }, {}), false)
  assert.equal(escalationAvailableFor({ sandboxMode: 'workspace-write' }, undefined), false)
  assert.equal(escalationAvailableFor({ sandboxMode: 'workspace-write' }, {}), true)
})

test('escalation parameters mirror the tool-bash contract', () => {
  assert.deepEqual(ESCALATION_PARAMETERS.sandbox_permissions.enum, ['workspace-write', 'danger-full-access'])
  assert.equal(typeof ESCALATION_PARAMETERS.justification.description, 'string')
  assert.match(ESCALATION_GUIDANCE, /sandbox_permissions/)
  assert.match(ESCALATION_GUIDANCE, /justification/)
  assert.match(ESCALATION_GUIDANCE, /sudo/)
})

test('validateEscalationArgs enforces the pairing', () => {
  assert.throws(() => validateEscalationArgs('danger-full-access', undefined), /requires a justification/)
  assert.throws(() => validateEscalationArgs(undefined, 'because'), /only valid together/)
  assert.throws(() => validateEscalationArgs('danger-full-access', '   '), /non-empty/)
  assert.doesNotThrow(() => validateEscalationArgs('danger-full-access', 'write the dsh settings file'))
  assert.doesNotThrow(() => validateEscalationArgs(undefined, undefined))
})

test('outputLooksSandboxDenied matches EROFS in both locales, never gates normal failures', () => {
  assert.equal(outputLooksSandboxDenied("cp: cannot create regular file '/x': Read-only file system"), true)
  assert.equal(outputLooksSandboxDenied("cp: 无法创建普通文件 '/x': 只读文件系统"), true)
  assert.equal(outputLooksSandboxDenied('tsc: error TS2305 in build'), false)
  assert.equal(outputLooksSandboxDenied('Permission denied'), false)
})

test('renderShellRun renders stdout, stderr, and status markers', () => {
  assert.equal(
    renderShellRun({ stdout: { text: 'hello\n' }, stderr: { text: '' }, exitCode: 0, signal: null }),
    'hello\n',
  )
  assert.equal(
    renderShellRun({ stdout: { text: 'out' }, stderr: { text: 'oops' }, exitCode: 1, signal: null }),
    'out\n[stderr]\noops\n[exit code: 1]',
  )
  assert.equal(
    renderShellRun({ stdout: { text: '' }, stderr: { text: '' }, exitCode: 0, signal: null }),
    '(no output)',
  )
  assert.match(
    renderShellRun({ stdout: { text: '' }, stderr: { text: '' }, exitCode: null, signal: 'SIGTERM' }),
    /\[killed by signal: SIGTERM\]/,
  )
  assert.match(
    renderShellRun({ stdout: { text: 'partial' }, stderr: { text: '' }, exitCode: null, signal: null, timedOut: true, timeoutMs: 5000 }),
    /\[timed out after 5000ms\]/,
  )
  assert.match(
    renderShellRun({ stdout: { text: '' }, stderr: { text: '' }, exitCode: null, signal: null, sandbox: { mode: 'workspace-write', denied: false, runnerFailed: true } }),
    /sandbox runner itself failed/,
  )
})
