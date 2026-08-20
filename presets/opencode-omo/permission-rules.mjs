// opencode/omo permission-rules approximation on the native `tools/pre-execute`
// seam. Two rulesets that the prompt/toolFilter layers cannot express:
//
// 1. external_directory: file/glob/grep/lsp arguments that resolve outside the
//    session workspace root ask for approval (opencode's default `ask`).
// 2. doom_loop: three identical tool calls for one agent within 60 seconds ask
//    for approval instead of silently burning the step budget.
//
// Every other allow/deny rule is already enforced by dsh-native sandbox policy,
// named-subagent toolFilter rows, and the driver's model-family tool gate.
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export const name = 'opencode-omo-permission-rules'

/**
 * Path-bearing parameters checked by the external-directory rule. The
 * tool-surface shims re-register read/write/edit with opencode's camelCase
 * `filePath` schema, so pre-execute sees camelCase arguments for those tools;
 * the snake_case entries keep coverage where the native dsh definitions are
 * mounted directly (read_image, hashline_edit, lsp stay snake_case).
 */
const PATH_ARGUMENTS = {
  read: ['filePath', 'file_path'],
  write: ['filePath', 'file_path'],
  edit: ['filePath', 'file_path'],
  read_image: ['file_path'],
  hashline_edit: ['file_path'],
  glob: ['path'],
  grep: ['path'],
  lsp: ['file_path'],
}

function workspaceRoot(exec) {
  return exec.agent?.session?.header?.cwd ?? process.cwd()
}

/** One candidate path argument for a tool call, or undefined when not path-bearing. */
export function pathArgument(exec) {
  const names = PATH_ARGUMENTS[exec.name]
  if (names === undefined || typeof exec.arguments !== 'object' || exec.arguments === null) return undefined
  for (const name of names) {
    const value = exec.arguments[name]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/**
 * True when `path` escapes the workspace root. Absolute paths outside the root
 * escape; relative paths are resolved against the root and checked.
 */
export function outsideWorkspace(path, root) {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path)
  const rel = relative(resolve(root), absolute)
  if (rel === '') return false
  return rel.startsWith('..') || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

export function externalDirectoryReason(exec) {
  const path = pathArgument(exec)
  if (path === undefined) return undefined
  if (!outsideWorkspace(path, workspaceRoot(exec))) return undefined
  return `opencode-omo: "${exec.name}" would access a path outside the workspace root and requires approval (opencode external_directory: ask)`
}

/** Per-agent repeated-call tracking for the doom-loop rule. */
function newDoomState() {
  return { key: undefined, count: 0, firstAt: 0, lastAt: 0 }
}

function callKey(exec) {
  let args
  try { args = JSON.stringify(exec.arguments) } catch { args = String(exec.arguments) }
  return `${exec.name}\u0000${args}`
}

export function doomLoopReason(state, exec, now = Date.now(), maxRepeats = 3, windowMs = 60_000) {
  const key = callKey(exec)
  if (key !== state.key) {
    state.key = key
    state.count = 1
    state.firstAt = now
    state.lastAt = now
    return undefined
  }
  if (now - state.firstAt > windowMs) {
    state.key = key
    state.count = 1
    state.firstAt = now
    state.lastAt = now
    return undefined
  }
  state.count += 1
  state.lastAt = now
  if (state.count >= maxRepeats) {
    state.count = 0
    return `opencode-omo: identical "${exec.name}" call repeated ${maxRepeats} times in a loop; requires approval (opencode doom_loop: ask)`
  }
  return undefined
}

export function apply(ctx) {
  const states = new Map()
  const stateFor = (exec) => {
    const sessionId = exec.agent?.session?.id ?? '<none>'
    let state = states.get(sessionId)
    if (state === undefined) {
      state = newDoomState()
      states.set(sessionId, state)
    }
    return state
  }

  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (decision.kind !== 'allow') return decision
    const external = externalDirectoryReason(exec)
    if (external !== undefined) return { kind: 'ask', reason: external }
    const doom = doomLoopReason(stateFor(exec), exec)
    if (doom !== undefined) return { kind: 'ask', reason: doom }
    return decision
  })

  ctx.on('agent/disposed', ({ agent }) => {
    states.delete(agent.session.id)
  })
}
