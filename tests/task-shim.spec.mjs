/**
 * Pure-helper tests for the omo `task` shim: route resolution and the
 * `load_skills` -> `<loaded_skills>` prompt prefix.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KNOWN_CATEGORIES,
  KNOWN_SUBAGENT_TYPES,
  renderLoadedSkills,
  resolveTaskRoute,
  SUBAGENT_TYPE_DEFS,
} from '../presets/opencode-omo/task-shim.mjs'

test('renderLoadedSkills returns an empty string for empty or missing input', () => {
  assert.equal(renderLoadedSkills([]), '')
  assert.equal(renderLoadedSkills(undefined), '')
  assert.equal(renderLoadedSkills([null, '', 1]), '')
})

test('renderLoadedSkills renders the exact <loaded_skills> child-prompt prefix', () => {
  assert.equal(
    renderLoadedSkills(['frontend', 'ulw-plan']),
    '\n\n<loaded_skills>\n'
      + 'Load and follow these skills first via the skill tool: frontend, ulw-plan.\n'
      + '</loaded_skills>\n',
  )
})

test('resolveTaskRoute prefers task_id over every other routing input', () => {
  assert.deepEqual(
    resolveTaskRoute({ task_id: 'ses_123', subagent_type: 'explore', category: 'quick' }),
    { kind: 'followup', taskId: 'ses_123' },
  )
})

test('resolveTaskRoute maps known subagent_type names', () => {
  for (const subagentType of KNOWN_SUBAGENT_TYPES) {
    assert.deepEqual(resolveTaskRoute({ subagent_type: subagentType }), {
      kind: 'subagent-type',
      subagentType,
    })
  }
})

test('resolveTaskRoute rejects unknown subagent_type with the known list', () => {
  assert.throws(
    () => resolveTaskRoute({ subagent_type: 'plan' }),
    /unknown subagent_type "plan"/,
  )
  assert.throws(
    () => resolveTaskRoute({ subagent_type: 'plan' }),
    new RegExp(KNOWN_SUBAGENT_TYPES.join(', ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
})

test('resolveTaskRoute maps known categories', () => {
  for (const category of KNOWN_CATEGORIES) {
    assert.deepEqual(resolveTaskRoute({ category }), { kind: 'category', category })
  }
})

test('resolveTaskRoute rejects unknown categories with the known list', () => {
  assert.throws(
    () => resolveTaskRoute({ category: 'unknown-category' }),
    /unknown task category "unknown-category"/,
  )
  assert.throws(
    () => resolveTaskRoute({ category: 'unknown-category' }),
    new RegExp(KNOWN_CATEGORIES.join(', ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
})

test('resolveTaskRoute falls back to a generic subagent when neither specialist nor category is given', () => {
  assert.deepEqual(resolveTaskRoute({ prompt: 'do a thing' }), { kind: 'generic' })
  assert.deepEqual(resolveTaskRoute({}), { kind: 'generic' })
})

test('subagent_type definitions mirror the named rows in agent.cordis.yml', () => {
  // Same names as the named tool rows.
  assert.deepEqual(KNOWN_SUBAGENT_TYPES, [
    'oracle',
    'librarian',
    'explore',
    'metis',
    'momus',
    'multimodal-looker',
    'sisyphus',
    'hephaestus',
    'atlas',
    'sisyphus-junior',
  ])
  // Read-only specialists deny write/edit and all delegation names.
  for (const subagentType of ['oracle', 'librarian', 'explore', 'metis', 'momus']) {
    const filter = SUBAGENT_TYPE_DEFS[subagentType].toolFilter
    assert.ok(filter.deny.includes('write'))
    assert.ok(filter.deny.includes('edit'))
    assert.ok(filter.deny.includes('subagent'))
    assert.ok(filter.deny.includes('subagent_fork'))
    assert.ok(filter.deny.includes('workflow'))
    assert.ok(filter.deny.includes('ralph'))
  }
  // multimodal-looker only keeps read/read_image.
  assert.deepEqual(SUBAGENT_TYPE_DEFS['multimodal-looker'].toolFilter, {
    allow: ['read', 'read_image'],
  })
  // Primary-agent rows deny the whole named roster.
  for (const subagentType of ['sisyphus', 'hephaestus', 'atlas', 'sisyphus-junior']) {
    const filter = SUBAGENT_TYPE_DEFS[subagentType].toolFilter
    for (const known of KNOWN_SUBAGENT_TYPES) {
      assert.ok(filter.deny.includes(known), `${subagentType} should deny ${known}`)
    }
    assert.ok(filter.deny.includes('workflow'))
    assert.ok(filter.deny.includes('ralph'))
  }
})
