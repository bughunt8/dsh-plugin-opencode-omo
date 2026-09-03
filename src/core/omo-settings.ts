/**
 * Pure normalization for the `opencode-omo-roles` settings section.
 *
 * The settings namespace stores two maps:
 *
 *   opencode-omo-roles:
 *     roles:    { <role>: { model?, fallbackModels, maxSteps?, ultrawork? } }
 *     sessions: { <sessionId>: <role> }
 *
 * The host registry writes `model: null` for "follow the session model"; the
 * browser settings scope decodes that into the runtime shape used by the UI
 * (`model` omitted). This module owns that conversion so the client decode and
 * unit tests share one source of truth with no dsh imports.
 */

import { isOmoRole, type OmoModelSelection, type OmoRoleConfig, type OmoUltraworkOverride } from './omo-roles.ts'

/** Settings namespace id registered with `ctx.settings` / bound on the client. */
export const OMO_ROLE_SETTINGS_NAMESPACE = 'opencode-omo-roles'

/** Runtime settings-section shape consumed by the client. */
export interface OmoSettingsSection {
  readonly roles: Record<string, OmoRoleConfig>
  readonly sessions: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeModelSelection(raw: unknown): OmoModelSelection | undefined {
  if (!isRecord(raw)) return undefined
  const provider = raw.provider
  const model = raw.model
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') return undefined
  const reasoningEffort = raw.reasoningEffort
  return {
    provider,
    model,
    ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}),
  }
}

function normalizeUltrawork(raw: unknown): OmoUltraworkOverride | undefined {
  if (!isRecord(raw)) return undefined
  const model = normalizeModelSelection(raw.model)
  const reasoningEffort = raw.reasoningEffort
  if (model === undefined && (typeof reasoningEffort !== 'string' || reasoningEffort === '')) return undefined
  return {
    ...(model === undefined ? {} : { model }),
    ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}),
  }
}

function normalizeRoleConfig(raw: unknown): OmoRoleConfig | undefined {
  if (!isRecord(raw)) return undefined
  const model = raw.model === null || raw.model === undefined
    ? undefined
    : normalizeModelSelection(raw.model)
  const fallbackModels = Array.isArray(raw.fallbackModels)
    ? raw.fallbackModels.map(normalizeModelSelection).filter((entry): entry is OmoModelSelection => entry !== undefined)
    : []
  const maxSteps = typeof raw.maxSteps === 'number' && Number.isSafeInteger(raw.maxSteps) && raw.maxSteps > 0
    ? raw.maxSteps
    : undefined
  const ultrawork = normalizeUltrawork(raw.ultrawork)
  return {
    ...(model === undefined ? {} : { model }),
    fallbackModels,
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(ultrawork === undefined ? {} : { ultrawork }),
  }
}

function normalizeRoles(raw: unknown): Record<string, OmoRoleConfig> {
  const out: Record<string, OmoRoleConfig> = {}
  if (!isRecord(raw)) return out
  for (const [role, config] of Object.entries(raw)) {
    if (!isOmoRole(role)) continue
    const normalized = normalizeRoleConfig(config)
    if (normalized !== undefined) out[role] = normalized
  }
  return out
}

function normalizeSessions(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isRecord(raw)) return out
  for (const [sessionId, role] of Object.entries(raw)) {
    if (typeof role === 'string' && isOmoRole(role)) out[sessionId] = role
  }
  return out
}

/** Normalize a raw settings section into the client runtime shape. */
export function normalizeOmoSettingsSection(raw: unknown): OmoSettingsSection {
  if (!isRecord(raw)) return { roles: {}, sessions: {} }
  return {
    roles: normalizeRoles(raw.roles),
    sessions: normalizeSessions(raw.sessions),
  }
}
