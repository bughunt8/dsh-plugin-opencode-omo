/**
 * Pure-helper tests for the start-work continuation hook: Boulder session
 * matching, checkbox detection, and when a turn should be steered.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  activeBoulderWork,
  hasOpenPlanCheckbox,
  name,
  parseBoulder,
  sessionMatchesBoulder,
  shouldContinueStartWork,
  stripSessionPrefix,
} from '../presets/opencode-omo/start-work-continuation.mjs'

const boulder = {
  schema_version: 2,
  active_work_id: 'w1',
  works: {
    w1: {
      work_id: 'w1',
      active_plan: '.omo/plans/demo.md',
      status: 'active',
      session_ids: ['dsh:sess-1'],
    },
  },
}

test('module identity', () => {
  assert.equal(name, 'opencode-omo-start-work-continuation')
})

test('stripSessionPrefix accepts every harness prefix this preset may see', () => {
  assert.equal(stripSessionPrefix('dsh:abc'), 'abc')
  assert.equal(stripSessionPrefix('codex:abc'), 'abc')
  assert.equal(stripSessionPrefix('omo:abc'), 'abc')
  assert.equal(stripSessionPrefix('opencode:abc'), 'abc')
  assert.equal(stripSessionPrefix('abc'), 'abc')
})

test('sessionMatchesBoulder matches this session across prefixes', () => {
  assert.equal(sessionMatchesBoulder('sess-1', ['dsh:sess-1']), true)
  assert.equal(sessionMatchesBoulder('dsh:sess-1', ['codex:sess-1']), true)
  assert.equal(sessionMatchesBoulder('sess-1', ['dsh:other']), false)
})

test('hasOpenPlanCheckbox only counts column-0 implementation or verifier rows', () => {
  assert.equal(hasOpenPlanCheckbox('- [ ] 1. Implement auth\n'), true)
  assert.equal(hasOpenPlanCheckbox('- [ ] F1. Final verification\n'), true)
  assert.equal(hasOpenPlanCheckbox('- [x] 1. Done\n- [ ] F2. Verify\n'), true)
  assert.equal(hasOpenPlanCheckbox('- [x] 1. Done\n'), false)
  assert.equal(hasOpenPlanCheckbox('  - [ ] nested acceptance\n'), false)
  assert.equal(hasOpenPlanCheckbox('- [ ] prose without a task number\n'), false)
})

test('activeBoulderWork requires an active work that lists this session', () => {
  assert.deepEqual(activeBoulderWork(boulder, 'sess-1')?.work_id, 'w1')
  assert.equal(activeBoulderWork(boulder, 'other'), undefined)
  assert.equal(activeBoulderWork({
    ...boulder,
    works: { w1: { ...boulder.works.w1, status: 'completed' } },
  }, 'sess-1'), undefined)
})

test('shouldContinueStartWork waits for jobs and requires open checkboxes', () => {
  const plan = '- [ ] 1. Next checkbox\n'
  assert.equal(shouldContinueStartWork({ boulder, sessionId: 'sess-1', planText: plan }), true)
  assert.equal(shouldContinueStartWork({
    boulder, sessionId: 'sess-1', planText: plan, runningJobs: 1,
  }), false)
  assert.equal(shouldContinueStartWork({
    boulder, sessionId: 'sess-1', planText: '- [x] 1. Done\n',
  }), false)
  assert.equal(parseBoulder('{'), undefined)
})
