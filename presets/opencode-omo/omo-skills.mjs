// omo skill provider: publishes the omo skill set shipped beside this preset
// through the dsh skill registry as `user-dsh`-sourced skills.
//
// Registering them as `user-dsh` (instead of a `customSkillDirs` filesystem
// root, whose source is `custom`) makes them visible to the third-party
// @maintainall/dsh-plugin-skills-manager: that plugin only manages
// `project-dsh / project-agents / user-dsh / user-agents` sources, and its
// enforcement provider (rank 50) shadows disabled skills by name. This module
// intentionally does NOT modify that plugin; it only publishes skills in a
// source taxonomy that plugin already understands.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as parseYaml } from 'js-yaml'

export const name = 'omo-skills'
export const inject = ['skills']

const SKILLS_DIR = new URL('skills/', import.meta.url)
const PROVIDER = 'omo-skills'
const RANK = 350

function parseSkill(text, path) {
  const start = text.indexOf('---')
  if (start !== 0) return undefined
  const end = text.indexOf('\n---', start + 3)
  if (end < 0) return undefined
  const frontmatter = parseYaml(text.slice(start + 3, end)) ?? {}
  const name = typeof frontmatter.name === 'string' ? frontmatter.name : undefined
  const description = typeof frontmatter.description === 'string' ? frontmatter.description : undefined
  if (name === undefined || description === undefined) return undefined
  return {
    name,
    description,
    ...(typeof frontmatter.whenToUse === 'string' ? { whenToUse: frontmatter.whenToUse } : {}),
    content: text.slice(end + 4).trim(),
    metadata: frontmatter.metadata,
    path,
  }
}

async function discover() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = join(entry.name, 'SKILL.md')
    let text
    try {
      text = await readFile(new URL(skillPath, SKILLS_DIR), 'utf8')
    } catch {
      continue
    }
    const parsed = parseSkill(text, skillPath)
    if (parsed === undefined) continue
    skills.push(parsed)
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export { discover as discoverOmoSkills, parseSkill }

export function apply(ctx) {
  ctx.skills.registerProvider(() => ({
    name: PROVIDER,
    async list() {
      const discovered = await discover()
      return discovered.map(skill => {
        const absolute = fileURLToPath(new URL(skill.path, SKILLS_DIR))
        return {
          name: skill.name,
          description: skill.description,
          ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'user-dsh',
          provider: PROVIDER,
          rank: RANK,
          locator: absolute,
          path: absolute,
          ...(skill.metadata === undefined ? {} : { metadata: skill.metadata }),
        }
      })
    },
    async get(candidate) {
      const absolute = typeof candidate.path === 'string' ? candidate.path : candidate.locator
      if (typeof absolute !== 'string') return undefined
      let text
      try {
        text = await readFile(absolute, 'utf8')
      } catch {
        return undefined
      }
      const parsed = parseSkill(text, absolute)
      if (parsed === undefined) return undefined
      return {
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'user-dsh',
        provider: PROVIDER,
        resourceBase: { kind: 'directory', path: dirname(absolute) },
        path: absolute,
        content: parsed.content,
        ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
      }
    },
  }))
}
