/**
 * React binding for the opencode-omo role store.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { OmoRolesStore, OmoRpcCaller, OmoSettingsScope } from './omo-roles-store.ts'
import { OmoRolesStore as RoleStore } from './omo-roles-store.ts'
import type { OmoRolesState } from './omo-wire.ts'

export interface UseOmoRolesResult {
  readonly state: OmoRolesState
  readonly store: OmoRolesStore
}

/**
 * Create (or reuse) the role store for one mounted surface and subscribe it to
 * React. The store is intentionally per-surface: the composer chip resolves a
 * session id while the settings section reads the global configs.
 */
export function useOmoRoles(
  scope: OmoSettingsScope | undefined,
  rpc: OmoRpcCaller | undefined,
  sessionId: string | undefined,
): UseOmoRolesResult {
  const store = useMemo(
    () => new RoleStore(scope, rpc, sessionId),
    [scope, rpc, sessionId],
  )
  useEffect(() => store.start(), [store])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { state, store }
}
