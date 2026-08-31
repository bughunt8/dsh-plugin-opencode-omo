# dsh-side patches

**This directory no longer ships a patch.** The previous
`0001-agent-pre-step-assistant-prefill.patch` is **removed** as of the 0.1.2-alpha.2
retarget.

## Why it was deleted

Official 0.1.2-alpha.2 `PreStepDecision` is still only
`reject | { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: true }`.
`agent/request` cannot mutate messages. A local assistant-prefill seam would
fork the loop and the reconstructable-requests invariant for one preset.

The supported plugin path is `ctx.systemPrompt.section` with the same
`MAX_STEPS_PROMPT` text. That is now the default, not a temporary fallback
users are asked to “fix” by patching dsh.

## Behavioral inconsistencies vs opencode (and vs the deleted patch)

Keep these in mind when comparing traces or benches:

1. **Role / position.** opencode appends the ceiling text as an **assistant**
   continuation. Here it is a **system** prefix on that step. A model that
   obeys “CRITICAL - MAXIMUM STEPS REACHED” more strongly as “its own last
   line” may keep tool-calling longer, or wrap up more timidly, than opencode.
2. **Token accounting.** The extra tokens sit in the system prompt, not in an
   assistant message or `request/header` companion. Cache-key and billing
   breakdowns will not match a patched-harness or opencode run.
3. **Transcript cleanliness is the same.** Neither path writes a session
   `assistant/message` or `user/message` for the ceiling text. Compaction and
   stats still omit it.
4. **No silent drop.** The ceiling still fires at `step >= maxSteps`. Only the
   channel changed.
5. **Optional leftover seam.** If a developer harness still contains
   `assistantPrefill` in `@deepseek-ai/dsh-agent-loop`, the driver uses it.
   That is not supported or documented as an install step.

Upstream request for a general-purpose request-only assistant tail:
https://github.com/deepseek-ai/deepseek-harness/discussions/2407
