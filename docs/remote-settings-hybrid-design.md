# opencode-omo settings transport: hybrid settingsScope + authenticated RPC

Status: designed for implementation.

## Background

The opencode-omo client needs durable, per-session and per-role data:

- `sessions`: session id → selected omo role.
- `roles`: role id → primary model / fallback chain / maxSteps / ultrawork.

This data is already registered with the dsh settings provider as the
`opencode-omo-roles` namespace and lives in the profile `settings.yaml`. The
host registry (`OmoRoleRegistry`) reads and writes that namespace through its
host-side `settings.update()`.

The browser historically reached this data through raw `webServer.register`
routes under `/plugins/@royenheart/dsh-plugin-opencode-omo/*`:

- `GET /plugins/.../roles` — catalog + configs + defaults + current role.
- `POST /plugins/.../role` — persist one session's role.
- `POST /plugins/.../role-config` — persist one role's config.

Two problems with that transport:

1. **It bypasses dsh's browser session authentication.** Those routes are
   mounted directly on the webserver, so a request that reaches the server is
   accepted without the Host/Origin fence or the dsh web session cookie. When
   the server is exposed through a reverse proxy, any client that can reach the
   proxy can read and write role settings.
2. **It bypasses the client settings transport.** `opencode-omo-roles` is
   settings-shaped data, so the canonical client surface is
   `ctx.settingsScope.bind(...)` with writes through the `settings.mutate` RPC.
   A hand-rolled HTTP write path does not participate in the settings document
   model (no shared mirror, no document-updated invalidation, no revision
   fencing on the client).

## Constraints

dsh deliberately disables Host settings persistence for any browser whose page
URL is not loopback:

- `ui-settings` chooses `persistence = ctx.remote.$host.isLoopback ? 'host' : 'memory'`.
- On a non-loopback page the bound settings scope reports
  `status: 'unavailable'` and its writes are no-ops.

Therefore a client that **only** uses `settingsScope` would work on loopback
and silently lose writes for a remote browser. A client that **only** uses a
custom RPC channel would work everywhere but would ignore the standard settings
transport on loopback.

## Design

Use the same hybrid as the skills-manager plugin:

- loopback (`settingsScope` ready): read and write through `settingsScope`.
- non-loopback (`settingsScope` unavailable): read and write through an
  authenticated RPC channel that the host plugin registers with
  `ctx.connection.rpc.handle`.

The authenticated channel reuses dsh's own connection authentication: the
physical route runs every request through the same Host/Origin trust fence and
dsh web session cookie verification as the `/api` RPC. The plugin does **not**
register bare `webServer` write routes.

### Channel contract

Channel: `/opencode-omo` (single path segment, as required by the connection
channel pattern).

Endpoints:

- `catalog/get` — read-only payload `{ sessionId?: string }`. Returns
  `{ defaultRole, roles, configs, defaults, currentRole? }` from the host
  registry.
- `role/set` — payload `{ sessionId: string, role: string }`. Persists the
  session role and returns `{ currentRole, config }`.
- `role-config/set` — payload `{ role: string, config: OmoRoleConfig }`.
  Persists one role's config and returns `{ config }`.

All payloads and responses are JSON-serializable. Responses use the dsh
connection RPC result shape `{ ok: true, value }` or
`{ ok: false, error: { code, message, details } }`.

The client calls the channel with `ctx.connection.rpc.call('/opencode-omo',
'catalog/get', ...)`. The host registers it with
`ctx.connection.rpc.handle('/opencode-omo', handler)`.

### Client transport selection

1. Bind `ctx.settingsScope.bind({ namespace: 'opencode-omo-roles', decode })`.
2. Read `scope.getSnapshot().status`.
   - `ready`: derive `roles` / `sessions` from the scope snapshot; subscribe to
     scope changes; write with `scope.set('roles', nextRoles)` or
     `scope.set('sessions', nextSessions)`.
   - `unavailable`: fetch the catalog through the authenticated RPC channel and
     write through `role/set` / `role-config/set`.
3. Static role catalog and live-catalog-derived defaults are not settings data.
   They are read through the authenticated `catalog/get` endpoint (or, on
   loopback, still through it — it is read-only and authenticated).

### Host changes

- Keep `ctx.settings.register('opencode-omo-roles', ...)`.
- Fix the settings schema so it matches the stored shape and is
  client-write-friendly: `model` is `selection | null`, `fallbackModels`
  defaults to `[]`, `maxSteps` and `ultrawork` are optional, and nested model
  selections allow an optional `reasoningEffort`.
- `OmoRoleRegistry` already reads the settings scope live on every
  `roleFor` / `configFor` / `configs` call, so browser writes through
  `settingsScope` are visible to the registry without an additional watch.
- Register the `/opencode-omo` RPC channel when `ctx.get('connection')`
  provides an `rpc.handle` method (web compositions). Headless/minimal
  compositions skip the channel and keep the host-side settings behavior.
- Remove the raw `webServer.register` routes for `/plugins/.../roles`,
  `/plugins/.../role`, and `/plugins/.../role-config`. The GET role catalog is
  replaced by the authenticated `catalog/get` endpoint.

### Client changes

- Add `settingsScope` and `connection` to the client `inject`.
- Add a pure `src/core/omo-settings.ts` normalizer so the settings-scope decode
  step stays testable with no dsh imports.
- Add a small client store/hook that selects the transport and exposes one
  reactive snapshot to both `RoleSelect` and `RoleSettingsSection`.
- `RoleSelect` and `RoleSettingsSection` no longer receive endpoint strings;
  they consume the store and call `setRole` / `setRoleConfig`.
- The session model catalog and model selection keep using the existing
  `remote.session` RPC (already authenticated).

### Proxy / deploy notes

No proxy changes are required. The channel lives under the connection
auth boundary, so the proxy only needs to forward the path and preserve the
same Host/Origin/Cookie behavior it already uses for `/api`.

Security boundary: with a proxy that rewrites Host/Origin and injects the
session cookie, the proxy itself is the trust boundary — the same boundary that
already applies to dsh's own `/api`. The plugin adds no weaker write path.

## Verification plan

- Unit tests cover the pure settings normalizer and the host RPC handler
  validation/application logic.
- Host smoke tests boot the plugin with a mock `connection` service that
  records the logical channel, then exercise `catalog/get`, `role/set`, and
  `role-config/set`; the old raw `/plugins` routes are asserted absent.
- Client tests exercise the transport selection (loopback settingsScope vs
  remote RPC fallback) without hard-coded machine details.
- End-to-end smoke: load the built plugin into a dsh web profile, confirm the
  plugin survives (no load error), and confirm the composer role chip and the
  settings section entry are still present.
