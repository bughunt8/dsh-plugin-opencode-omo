/**
 * omo.json import core (English surface).
 *
 * Pure, dependency-injected logic shared by the host routes, the startup
 * auto-import, and the CLI script: a flat JSON map of omo role ids to role
 * configs (the same wire shape as the role-config endpoint).
 *
 * Imports are non-fatal by design: unknown roles and malformed entries are
 * collected as per-role errors while valid entries still apply.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { isOmoRole, normalizeRoleConfig } from '../omo-role-registry_en.ts'
import type { OmoRoleConfig } from './omo-roles_en.ts'

/** Default location of the omo.json defaults file. */
export const OMO_JSON_DEFAULT_PATH = '~/.omo/omo.json'

/** Hard cap for an imported file (bytes); larger files are refused unread. */
export const OMO_JSON_MAX_BYTES = 2 * 1024 * 1024

/** Expand a leading `~/` against the host user's home directory. */
export function expandOmoPath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

/** Parse one omo.json document into per-role configs plus collected errors. */
export function parseOmoJson(text: string): {
  entries: Record<string, OmoRoleConfig>
  errors: string[]
} {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { entries: {}, errors: [`invalid JSON: ${String(error instanceof Error ? error.message : error)}`] }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entries: {}, errors: ['omo.json root must be a JSON object mapping role ids to configs'] }
  }
  const entries: Record<string, OmoRoleConfig> = {}
  const errors: string[] = []
  for (const [role, config] of Object.entries(raw)) {
    if (!isOmoRole(role)) {
      errors.push(`unknown omo role "${role}"`)
      continue
    }
    try {
      // normalizeRoleConfig returns the STORED shape (model: null); convert
      // back to the wire shape (model: undefined) like the registry's
      // configFor does, so entries stay assignable to OmoRoleConfig.
      const stored = normalizeRoleConfig(config as OmoRoleConfig)
      entries[role] = {
        ...(stored.model === null ? {} : { model: stored.model }),
        fallbackModels: stored.fallbackModels ?? [],
        ...(stored.maxSteps === undefined ? {} : { maxSteps: stored.maxSteps }),
        ...(stored.ultrawork === undefined ? {} : { ultrawork: stored.ultrawork }),
      }
    } catch (error) {
      errors.push(`role "${role}": ${String(error instanceof Error ? error.message : error)}`)
    }
  }
  return { entries, errors }
}

/**
 * Import one omo.json document through the role registry.
 * `reader(path)` returns the file text (injected for tests); `registry` is
 * any object exposing `setRoleConfig(role, config)`.
 */
export async function importOmoJson(
  reader: (path: string) => Promise<string>,
  registry: { setRoleConfig(role: string, config: OmoRoleConfig): Promise<void> },
  path: string,
): Promise<{ ok: boolean; imported: number; errors: string[] }> {
  let text: string
  try {
    text = await reader(path)
  } catch (error) {
    return {
      ok: false,
      imported: 0,
      errors: [`cannot read ${path}: ${String(error instanceof Error ? error.message : error)}`],
    }
  }
  const { entries, errors } = parseOmoJson(text)
  let imported = 0
  for (const [role, config] of Object.entries(entries)) {
    try {
      await registry.setRoleConfig(role, config)
      imported += 1
    } catch (error) {
      errors.push(`role "${role}": ${String(error instanceof Error ? error.message : error)}`)
    }
  }
  return { ok: true, imported, errors }
}

/** Read an omo.json file with the size cap enforced (host filesystem). */
export async function readOmoJsonFile(path: string): Promise<string> {
  const info = await stat(path)
  if (info.size > OMO_JSON_MAX_BYTES) {
    throw new Error(`omo.json exceeds the ${OMO_JSON_MAX_BYTES}-byte import cap`)
  }
  return readFile(path, 'utf8')
}
