/**
 * Client role store: one reactive snapshot over the opencode-omo role data.
 *
 * Loopback browsers read/write through `settingsScope` (the canonical settings
 * transport). Non-loopback browsers get a memory-mode scope (`unavailable`), so
 * the store falls back to the authenticated `/opencode-omo` RPC channel the
 * host plugin registers through `connection.rpc.handle`.
 *
 * The store itself is React-free so the transport selection can be unit-tested
 * with plain Node; components subscribe through `useSyncExternalStore`.
 */

import { OMO_DEFAULT_ROLE, OMO_ROLES } from '../core/omo-roles.ts'
import { normalizeOmoSettingsSection, type OmoSettingsSection } from '../core/omo-settings.ts'
import { OMO_RPC_CHANNEL, OMO_RPC_ENDPOINTS } from '../core/omo-rpc.ts'
import type { OmoRoleConfig } from '../core/omo-roles.ts'
import type { OmoModelSelection, OmoRolesState, OmoRoleView } from './omo-wire.ts'

/** The settings-scope face this client consumes. */
export interface OmoSettingsScope {
  getSnapshot(): { status: string; value?: OmoSettingsSection }
  subscribe(listener: () => void): () => void
  set(field: 'roles' | 'sessions', value: unknown): Promise<void>
}

/** Result shape returned by the connection RPC caller. */
export interface OmoRpcResultLike {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** The connection rpc face the remote-browser fallback calls through. */
export interface OmoRpcCaller {
  call(channel: string, endpoint: string, payload: unknown): Promise<OmoRpcResultLike>
}

const EMPTY_STATE: OmoRolesState = {
  defaultRole: OMO_DEFAULT_ROLE,
  roles: OMO_ROLES,
  configs: {},
  sessions: {},
  defaults: {},
  currentRole: OMO_DEFAULT_ROLE,
  loading: true,
  degraded: false,
  error: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeDefaults(raw: unknown): Record<string, OmoModelSelection | null> {
  const out: Record<string, OmoModelSelection | null> = {}
  if (!isRecord(raw)) return out
  for (const [role, value] of Object.entries(raw)) {
    if (value === null) {
      out[role] = null
      continue
    }
    if (!isRecord(value)) continue
    const provider = value.provider
    const model = value.model
    if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') continue
    const reasoningEffort = value.reasoningEffort
    out[role] = {
      provider,
      model,
      ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}),
    }
  }
  return out
}

function normalizeConfigs(raw: unknown): Record<string, OmoRoleConfig> {
  return normalizeOmoSettingsSection({ roles: raw }).roles
}

function normalizeCatalogRoles(raw: unknown): readonly OmoRoleView[] {
  if (!Array.isArray(raw)) return OMO_ROLES
  const roles = raw.filter((entry): entry is OmoRoleView => isRecord(entry)
    && typeof entry.id === 'string'
    && typeof entry.displayName === 'string'
    && (entry.mode === 'primary' || entry.mode === 'subagent' || entry.mode === 'all')
    && typeof entry.description === 'string'
    && typeof entry.fallbackHint === 'string')
  return roles.length > 0 ? roles : OMO_ROLES
}

/**
 * One reactive role store. Instantiate per mounted surface (composer chip or
 * settings section) with the session id that surface should resolve.
 */
export class OmoRolesStore {
  private state: OmoRolesState = { ...EMPTY_STATE }
  private readonly listeners = new Set<() => void>()
  private unsubscribeScope: (() => void) | undefined
  private started = false
  private loadingRemote = false

  constructor(
    private readonly scope: OmoSettingsScope | undefined,
    private readonly rpc: OmoRpcCaller | undefined,
    private readonly sessionId: string | undefined,
  ) {}

  getSnapshot = (): OmoRolesState => {
    return this.state
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Start scope subscription and the initial remote catalog read. Idempotent. */
  start(): () => void {
    if (this.started) return () => {}
    this.started = true
    if (this.scope !== undefined) {
      this.unsubscribeScope = this.scope.subscribe(() => { this.refreshFromScope() })
    }
    this.refreshFromScope()
    void this.loadRemoteCatalog()
    return () => {
      this.unsubscribeScope?.()
      this.unsubscribeScope = undefined
      this.started = false
    }
  }

  /** Persist one session's role. */
  async setRole(sessionId: string, role: string): Promise<void> {
    const snapshot = this.scope?.getSnapshot()
    if (this.scope !== undefined && snapshot?.status === 'ready') {
      const section = snapshot.value ?? { roles: {}, sessions: {} }
      const sessions = { ...section.sessions, [sessionId]: role }
      this.publish({ ...this.state, sessions, currentRole: role, error: null })
      try {
        await this.scope.set('sessions', sessions)
      } catch (cause) {
        this.refreshFromScope()
        this.publish({ ...this.state, error: cause instanceof Error ? cause.message : String(cause) })
        throw cause
      }
      return
    }
    if (this.rpc !== undefined) {
      try {
        const result = await this.rpc.call(OMO_RPC_CHANNEL, OMO_RPC_ENDPOINTS.roleSet, { sessionId, role })
        if (!result.ok) throw new Error(result.error?.message ?? 'role/set failed')
        this.publish({
          ...this.state,
          sessions: { ...this.state.sessions, [sessionId]: role },
          currentRole: role,
          degraded: false,
          error: null,
        })
      } catch (cause) {
        this.publish({ ...this.state, error: cause instanceof Error ? cause.message : String(cause) })
        throw cause
      }
      return
    }
    const error = new Error('opencode-omo settings unavailable in this browser')
    this.publish({ ...this.state, degraded: true, error: error.message })
    throw error
  }

  /** Persist one role's model/fallback configuration. */
  async setRoleConfig(role: string, config: OmoRoleConfig): Promise<void> {
    const snapshot = this.scope?.getSnapshot()
    if (this.scope !== undefined && snapshot?.status === 'ready') {
      const section = snapshot.value ?? { roles: {}, sessions: {} }
      const roles = { ...section.roles, [role]: config }
      this.publish({ ...this.state, configs: { ...this.state.configs, [role]: config }, error: null })
      try {
        await this.scope.set('roles', roles)
      } catch (cause) {
        this.refreshFromScope()
        this.publish({ ...this.state, error: cause instanceof Error ? cause.message : String(cause) })
        throw cause
      }
      return
    }
    if (this.rpc !== undefined) {
      try {
        const result = await this.rpc.call(OMO_RPC_CHANNEL, OMO_RPC_ENDPOINTS.roleConfigSet, { role, config })
        if (!result.ok) throw new Error(result.error?.message ?? 'role-config/set failed')
        const saved = isRecord(result.value) && isRecord(result.value.config)
          ? normalizeConfigs({ [role]: result.value.config })[role]
          : undefined
        this.publish({
          ...this.state,
          configs: { ...this.state.configs, [role]: saved ?? config },
          degraded: false,
          error: null,
        })
      } catch (cause) {
        this.publish({ ...this.state, error: cause instanceof Error ? cause.message : String(cause) })
        throw cause
      }
      return
    }
    const error = new Error('opencode-omo settings unavailable in this browser')
    this.publish({ ...this.state, degraded: true, error: error.message })
    throw error
  }

  /** Re-read configs/sessions from the settings scope. */
  private refreshFromScope(): void {
    const snapshot = this.scope?.getSnapshot()
    if (snapshot === undefined) return
    if (snapshot.status === 'ready') {
      const section = snapshot.value ?? { roles: {}, sessions: {} }
      this.publish({
        ...this.state,
        configs: section.roles,
        sessions: section.sessions,
        currentRole: this.sessionId === undefined ? OMO_DEFAULT_ROLE : (section.sessions[this.sessionId] ?? OMO_DEFAULT_ROLE),
        loading: false,
        degraded: false,
        error: null,
      })
      return
    }
    if (snapshot.status === 'unavailable' && this.rpc === undefined) {
      this.publish({
        ...this.state,
        loading: false,
        degraded: true,
        error: 'opencode-omo settings unavailable in this browser',
      })
    }
  }

  /** Load role catalog + defaults through the authenticated RPC channel. */
  private async loadRemoteCatalog(): Promise<void> {
    if (this.rpc === undefined || this.loadingRemote) return
    this.loadingRemote = true
    try {
      const result = await this.rpc.call(OMO_RPC_CHANNEL, OMO_RPC_ENDPOINTS.catalogGet, this.sessionId === undefined ? {} : { sessionId: this.sessionId })
      if (result.ok && isRecord(result.value)) {
        const value = result.value
        const next: OmoRolesState = {
          ...this.state,
          defaultRole: typeof value.defaultRole === 'string' ? value.defaultRole : OMO_DEFAULT_ROLE,
          roles: normalizeCatalogRoles(value.roles),
          configs: normalizeConfigs(value.configs),
          defaults: normalizeDefaults(value.defaults),
          currentRole: typeof value.currentRole === 'string' ? value.currentRole : this.state.currentRole,
          loading: false,
          degraded: false,
          error: null,
        }
        this.publish(next)
        // On loopback the settings scope is authoritative for configs/sessions.
        this.refreshFromScope()
      } else {
        this.remoteFailed(result.error?.message ?? 'catalog/get failed')
      }
    } catch (cause) {
      this.remoteFailed(cause instanceof Error ? cause.message : String(cause))
    } finally {
      this.loadingRemote = false
    }
  }

  private remoteFailed(message: string): void {
    if (this.scope?.getSnapshot().status === 'ready') {
      // Loopback still works without the remote catalog (defaults stay empty).
      this.publish({ ...this.state, loading: false, degraded: false })
      return
    }
    this.publish({ ...this.state, loading: false, degraded: true, error: message })
  }

  private publish(next: OmoRolesState): void {
    this.state = next
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // A throwing listener must not prevent the other listeners.
      }
    }
  }
}
