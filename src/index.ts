/**
 * dsh-plugin-opencode-omo — node half.
 *
 * The package is both a dsh BUNDLE (host row via cordis.patch.yml; the preset
 * itself ships through `$DSH_HOME/.agent-presets`) and a host plugin row. The
 * host half:
 * - registers the durable `opencode-omo-roles` settings namespace;
 * - mounts the OmoRoleRegistry service (`ctx.omoRoles`) consumed by the
 *   preset's native-seam loop shim;
 * - serves the browser surface through an authenticated connection RPC
 *   channel (`/opencode-omo`): role catalog, per-session role, and per-role
 *   model/fallback configuration.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { OmoRoleRegistry } from './omo-role-registry.ts'
import type { OmoRoleRegistryFace } from './omo-role-registry.ts'
import { OMO_DEFAULT_ROLE } from './core/omo-roles.ts'
import { OMO_ROLE_SETTINGS_NAMESPACE } from './core/omo-settings.ts'
import {
  OMO_RPC_CHANNEL,
  OMO_RPC_ENDPOINTS,
  parseOmoCatalogGetRequest,
  parseOmoRoleConfigSetRequest,
  parseOmoRoleSetRequest,
  type OmoRpcResult,
} from './core/omo-rpc.ts'

export { OmoRoleRegistry } from './omo-role-registry.ts'
export type { OmoRoleRegistryFace } from './omo-role-registry.ts'
export { OMO_DEFAULT_ROLE, OMO_ROLES, emptyRoleConfig, isOmoRole, normalizeOmoRole } from './core/omo-roles.ts'
export type { OmoModelSelection, OmoRoleConfig, OmoRoleSettings } from './core/omo-roles.ts'
export { OMO_RPC_CHANNEL, OMO_RPC_ENDPOINTS } from './core/omo-rpc.ts'
export type { OmoRpcResult } from './core/omo-rpc.ts'
export { OMO_ROLE_SETTINGS_NAMESPACE } from './core/omo-settings.ts'

/** Cordis plugin name. */
export const name = 'opencode-omo'

/** Required services: settings persistence + the web route registry. Headless benches satisfy the web registry with a standalone webserver row (see tests/benches). */
export const inject = ['settings', 'webServer']

const optionalString = z.union([z.string(), z.const(undefined)]).default(undefined)
const optionalNumber = z.union([z.number(), z.const(undefined)]).default(undefined)

const modelSelectionSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: optionalString,
})

const optionalModelSelection = z.union([modelSelectionSchema, z.const(undefined)]).default(undefined)

const ultraworkSchema = z.object({
  model: optionalModelSelection,
  reasoningEffort: optionalString,
})

const storedRoleConfigSchema = z.object({
  model: z.union([modelSelectionSchema, z.const(null), z.const(undefined)]).default(undefined),
  fallbackModels: z.array(modelSelectionSchema).default([]),
  maxSteps: optionalNumber,
  ultrawork: z.union([ultraworkSchema, z.const(undefined)]).default(undefined),
})

/** Runtime schema for the durable settings section. */
const SettingsSchema = z.object({
  roles: z.dict(storedRoleConfigSchema).default({}),
  sessions: z.dict(z.string()).default({}),
})

interface ConnectionRpcFace {
  rpc?: {
    handle(channel: string, handler: (endpoint: string, payload: unknown) => Promise<OmoRpcResult>): () => Promise<void>
  }
}

function badRequest(message: string): OmoRpcResult {
  return {
    ok: false,
    error: {
      code: 'opencode-omo/bad-request',
      message,
      details: {},
    },
  }
}

function badEndpoint(endpoint: string): OmoRpcResult {
  return {
    ok: false,
    error: {
      code: 'opencode-omo/bad-endpoint',
      message: `unknown endpoint ${endpoint}`,
      details: {},
    },
  }
}

/** Dispatch one `/opencode-omo` RPC endpoint. */
async function handleOmoRpc(
  roles: OmoRoleRegistryFace,
  endpoint: string,
  payload: unknown,
): Promise<OmoRpcResult> {
  if (endpoint === OMO_RPC_ENDPOINTS.catalogGet) {
    const request = parseOmoCatalogGetRequest(payload)
    if (request === undefined) return badRequest('invalid catalog/get payload')
    const catalog = roles.roles.map(role => ({ ...role }))
    return {
      ok: true,
      value: {
        defaultRole: OMO_DEFAULT_ROLE,
        roles: catalog,
        configs: roles.configs(),
        defaults: roles.defaults(),
        ...(request.sessionId === undefined ? {} : { currentRole: roles.roleFor(request.sessionId) }),
      },
    }
  }
  if (endpoint === OMO_RPC_ENDPOINTS.roleSet) {
    const request = parseOmoRoleSetRequest(payload)
    if (request === undefined) return badRequest('invalid role/set payload')
    try {
      await roles.setRole(request.sessionId, request.role)
      return {
        ok: true,
        value: {
          currentRole: request.role,
          config: roles.configFor(request.role),
        },
      }
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : String(error))
    }
  }
  if (endpoint === OMO_RPC_ENDPOINTS.roleConfigSet) {
    const request = parseOmoRoleConfigSetRequest(payload)
    if (request === undefined) return badRequest('invalid role-config/set payload')
    try {
      await roles.setRoleConfig(request.role, request.config)
      return {
        ok: true,
        value: { config: roles.configFor(request.role) },
      }
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : String(error))
    }
  }
  return badEndpoint(endpoint)
}

/**
 * Mount the role registry and the authenticated browser RPC channel.
 * @param ctx - host plugin context carrying settings and webServer.
 */
export function apply(ctx: Context): void {
  const scope = ctx.settings.register(
    OMO_ROLE_SETTINGS_NAMESPACE,
    SettingsSchema,
    { applies: 'live' },
  )
  ctx.plugin(OmoRoleRegistry, { settings: scope })

  // The registry service this plugin just mounted becomes injectable once its
  // fiber is up; the browser RPC surface runs in that callback so handlers
  // resolve the same live instance the preset driver reads. `connection` is
  // included so the channel registers only after the connection host service
  // is active (headless compositions without connection skip this callback).
  ctx.inject(['settings', 'webServer', 'omoRoles', 'connection'], (hostCtx) => {
    const roles = hostCtx.omoRoles
    const connection = hostCtx.get('connection') as ConnectionRpcFace | undefined
    hostCtx.effect(() => {
      if (connection?.rpc === undefined) return () => {}
      const disposeRpc = connection.rpc.handle(OMO_RPC_CHANNEL, (endpoint, payload) => {
        return handleOmoRpc(roles, endpoint, payload)
      })
      return () => disposeRpc()
    }, 'opencode-omo: authenticated role rpc')
  })
}
