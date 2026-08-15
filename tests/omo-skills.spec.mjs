/**
 * omo-skills provider smoke test: the shipped skill set must register through
 * the real dsh skill registry as `user-dsh`-sourced skills (the source the
 * third-party skills-manager plugin manages).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'

const omoSkills = await import('../presets/opencode-omo/omo-skills.mjs')

test('registers omo skills as user-dsh source through the dsh skill registry', async () => {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(omoSkills)
  const skills = await ctx.skills.list({ cwd: process.cwd() })
  assert.ok(skills.some(skill => skill.name === 'frontend'))
  assert.ok(skills.some(skill => skill.name === 'ulw-plan'))
  assert.ok(skills.some(skill => skill.name === 'start-work'))
  assert.ok(skills.every(skill => skill.source === 'user-dsh' && skill.provider === 'omo-skills'))
  const loaded = await ctx.skills.get('frontend', { cwd: process.cwd() })
  assert.ok(loaded !== undefined)
  assert.match(loaded.content, /Phase 0/)
  await ctx.fiber.dispose()
})
