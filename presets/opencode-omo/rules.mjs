// omo rules-injector: scans .omo/rules/, .claude/rules/, .cursor/rules/,
// .github/instructions/ and .github/copilot-instructions.md, walking up from the
// agent cwd to $HOME, and returns the markdown as model-visible text.
//
// `driver.mjs` owns the complete system prompt and folds this text into it.
// Registering it as `systemPrompt.context` does NOT work there: the driver
// suppresses runtime context so the complete prompt stays the only section,
// and that suppression also drops every context contribution. This module
// therefore stays a pure renderer and the preset no longer mounts it as a row.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const name = 'opencode-omo-rules'

const RULE_DIRS = ['.omo/rules', '.claude/rules', '.cursor/rules', '.github/instructions']
const RULE_FILES = ['.github/copilot-instructions.md']

function listRuleFiles(dir) {
  const files = []
  for (const rel of RULE_DIRS) {
    const base = join(dir, rel)
    let entries
    try { entries = readdirSync(base) } catch { continue }
    for (const entry of entries) {
      if (!entry.endsWith('.md') && !entry.endsWith('.mdc')) continue
      const path = join(base, entry)
      try { if (statSync(path).isFile()) files.push(path) } catch {}
    }
  }
  for (const rel of RULE_FILES) {
    const path = join(dir, rel)
    try { if (existsSync(path) && statSync(path).isFile()) files.push(path) } catch {}
  }
  return files
}

/**
 * Collect rule files from the session cwd up to (but not past) $HOME.
 * Returns `{ path, content }` in walk-up order with duplicates removed.
 */
export function collectRules(cwd) {
  const seen = new Set()
  const rules = []
  let dir = resolve(cwd)
  const home = homedir()
  while (true) {
    for (const path of listRuleFiles(dir)) {
      if (seen.has(path)) continue
      seen.add(path)
      try { rules.push({ path, content: readFileSync(path, 'utf8') }) } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir || dir === home) break
    dir = parent
  }
  return rules
}

/**
 * Render the omo rules block for one session cwd, or `''` when no rule files
 * exist. This is the exact text the reference rules-injector adds to context.
 */
export function renderRulesFor(cwd) {
  if (cwd === undefined || cwd === '') return ''
  const rules = collectRules(cwd)
  if (rules.length === 0) return ''
  return '<omo-rules>' + String.fromCharCode(10)
    + rules.map((rule) => 'Rules from: ' + rule.path + String.fromCharCode(10) + rule.content).join(String.fromCharCode(10) + String.fromCharCode(10))
    + String.fromCharCode(10) + '</omo-rules>'
}
