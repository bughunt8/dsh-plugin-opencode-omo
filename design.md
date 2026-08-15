# opencode-omo loop behavior on native dsh seams (no dsh loop changes)

## Objective

Give the `opencode-omo` preset a different turn/step behavior than the default
dsh loop — opencode's whole system prompt, per-model tool gating, max steps,
and omo role model routing/fallback — without adding a driver seam to dsh.

## Why the first driver-seam attempt was dropped

The first implementation added a `dsh-agent-driver` package and made
`ReactLoopAgent` subclassable so `OmoLoopAgent` could override `buildRequest`.
Re-scan found that every behavior that override provided already has a native
seam:

| Needed behavior | Native dsh seam |
|---|---|
| Whole opencode+omo system prompt (env block + role prompt + plan prompt) per step | `ctx.systemPrompt.section({ complete: true, text: ctx => ... })` — the text provider receives `context.agent` and is re-evaluated on every assembly |
| Suppress harness identity + runtime snapshot | `complete: true` + `ctx.systemPrompt.suppressRuntimeContext()` |
| opencode per-model tool gating (apply_patch vs edit/write) | `system-prompt/assemble` waterfall mutates `assembly.tools` |
| Ultrawork keyword detection before assembly | `agent/inbox/claimed` (fires inside `preStep` before `systemPrompt.assemble`) |
| maxSteps + verbatim MAX_STEPS_PROMPT | `agent/pre-step` waterfall appends the text as the final step-boundary user message |
| Role primary model + ultrawork override | `agent/request` waterfall |
| Fallback chain before harness retry policy | `agent/request-error` waterfall returning `{ kind: 'retry' }` |

All of these are scope-filtered events: a listener registered in the preset's
standing scope receives every agent under that preset (scope parent chain),
which is exactly the isolation the driver seam provided. Verified with three
probe tests against the dsh test harness: complete persona replacement, gpt
tool gating, role route, request-error fallback, max-steps injection, and
ultrawork routing all fire with a plain `ReactLoopAgent`.

## Known fidelity trade-offs (vs the old subclass)

1. dsh `agent/pre-step` accepts `UserMessage[]` only, so `MAX_STEPS_PROMPT` is
   injected as a user message instead of opencode's assistant-role prefill.
   Text is verbatim; the loop still appends the model's own assistant message.
2. The complete persona text provider has no turn/step argument. The step about
   to run is inferred from the durable log (`turn/start` + last `step/start`),
   and ultrawork is detected one event earlier via `agent/inbox/claimed`, so
   the env block sees the correct route for the step.
3. The env block is computed once per step. On an in-step fallback retry it
   keeps the primary route's model id instead of re-rendering for the fallback
   model (openCode re-renders per attempt). The request itself still routes to
   the fallback model.
4. Tool gating filters the request schemas through the assembly waterfall; the
   default loop's execution registry still knows both tool families, exactly
   as the previous `buildRequest`-level filter did.

## Preset publishing without dsh changes

dsh's agent-presets service always appends the user root
`$DSH_HOME/.agent-presets` (`includeUserRoot` defaults true), so the bundle no
longer patches `agent-presets.roots`. `install.py` creates a REAL directory
`$DSH_HOME/.agent-presets/opencode-omo` and symlinks its entries into the
package's `presets/opencode-omo` — discovery requires `dirent.isDirectory()`
and does not follow a symlinked roster row, but nested entry symlinks are fine
and keep shipped updates live.

## dsh-side footprint after the re-scan

Zero. All three earlier dsh-side changes were avoidable:

- `apps/cli/src/profile-boot.ts` root merge → replaced by the native user
  preset root (`$DSH_HOME/.agent-presets`, a real directory whose entries
  symlink into the package).
- The entire `packages/core/agent-driver` + `agent-loop` seam → replaced by
  the native prompt/event seams above.
- The `conversation.input.role` composer seat → the picker now registers in
  the existing `conversation.input.left` list slot. Trade-off: the role chip
  sits after the access/plan chips instead of immediately right of
  PermissionSelect; the dsh checkout is back at its unmodified `dev` state.

No dsh source, config, or workspace files are modified for this plugin.

