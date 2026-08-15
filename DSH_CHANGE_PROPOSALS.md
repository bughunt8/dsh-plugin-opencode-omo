# dsh 侧变更提案（opencode-omo 完整对齐所需的仅有两项）

审查来源：对 `/home/royenheart/softwares/deepseek-harness`（branch `dev`）全仓 seam 审计，独立 subagent 完成；已对 GitHub 做初步检索，未发现覆盖同一主题的既有 discussion/note。插件侧能做的本轮均已落地，下面两项经确认**无法用现有原生 seam 等价实现**，且改动都应是通用能力，不是 opencode-omo 专属通道。

---

## 1. `PreStepDecision.assistantPrefill`（high）— **已在 harness 工作树实现**

### English summary

> Add an optional assistant-role prefill to dsh's `agent/pre-step` decision so any preset/plugin can append a model continuation prefix (e.g. opencode's MAX_STEPS_PROMPT) before the request in the same step, instead of being limited to user messages.

**状态**：`packages/core/agent/src/runtime-types.ts`、`packages/core/agent-loop/src/agent.ts` 已按下方 patch 实现；`packages/core/agent-loop/tests/interception.spec.ts` 新增回归测试（24/24 通过）；`npm run build:lib:host` 通过。opencode-omo 的 `driver.mjs` 已切换为返回 `assistantPrefill`。

### Background

opencode 在 `session/prompt.ts:1383` 以 `{ role: 'assistant', content: MAX_STEPS_PROMPT }` 预填充，强制模型以文本续写并禁止工具调用。opencode-omo 目前只能把同一段文案作为 `user/message` 注入（`driver.mjs` 的 `agent/pre-step` 监听器），语义变成“用户指令”，不是“assistant 已经开始说的话”，续写行为有差异。

### Current state

- `packages/core/agent/src/runtime-types.ts:53-55`：
  ```ts
  export type PreStepDecision =
    | { kind: 'reject' }
    | { kind: 'enter'; messages: UserMessage[] }
  ```
- `packages/core/agent-loop/src/agent.ts:282-284`：所有 `decision.messages` 都以 `user/message` 落盘：
  ```ts
  for (const message of decision.messages) {
    this.session.append('user/message', message, { surfaceOp: 'append' })
  }
  ```
- `agent/request` 只能替换 `LlmCallConfig`，请求消息在进入瀑布前已由 `session.deriveMessages()` 冻结（`agent.ts:340-341, 407-412`）。

### Proposal

给 `PreStepDecision.enter` 增加可选 `assistantPrefill?: AssistantMessage`；`turn()` 在追加 user messages 之后、进入 `step(assembly)` 之前，以 `surfaceOp:'append'` 落一条 `assistant/message`。`deriveMessages()` 自然把该消息作为最后一条 assistant 消息带入请求；无字段时行为不变。

### Appendix: patch（示意，基于 dev）

```diff
--- a/packages/core/agent/src/runtime-types.ts
+++ b/packages/core/agent/src/runtime-types.ts
@@ -51,7 +51,8 @@ export type AgentStatus = 'idle' | 'running'
 /** Whether and with which messages the loop enters a proposed step. */
 export type PreStepDecision =
   | { kind: 'reject' }
-  | { kind: 'enter'; messages: UserMessage[] }
+  | { kind: 'enter'; messages: UserMessage[]; assistantPrefill?: AssistantMessage }
```
（配套：在 `agent/pre-step` 事件文档中说明该字段；类型导入 `AssistantMessage`。）

```diff
--- a/packages/core/agent-loop/src/agent.ts
+++ b/packages/core/agent-loop/src/agent.ts
@@ -281,6 +281,9 @@ export class ReactLoopAgent implements Agent {
           for (const message of decision.messages) {
             this.session.append('user/message', message, { surfaceOp: 'append' })
           }
+          if (decision.assistantPrefill !== undefined) {
+            this.session.append('assistant/message', decision.assistantPrefill, { surfaceOp: 'append' })
+          }
           // max-tokens is sticky: once any step hits the ceiling, later steps
```

### Questions to confirm

1. 是否希望 prefill 只在 `step===1` 允许（防止任意插件每步塞 assistant 污染历史），还是 waterfall 自行负责？
2. 该 prefill 是否需要进入 `request/header` 的 epoch 比较，还是作为普通消息只影响历史？

### Related

- `packages/core/agent-loop/README.md` 的 pre-step / message derivation 契约
- opencode `reference/opencode/packages/opencode/src/session/prompt.ts:1383`

---

## 2. Provider-visible `format` / `toolChoice`（medium）

### English summary

> Extend `GenerateOptions` and `LlmCallConfig` with optional `format` (`json_schema`) and `toolChoice` fields, mapped by adapters to provider-native `response_format` / `tool_choice`, so plugins can request provider-enforced structured output or required tool calls without bespoke seams.

### Background

opencode 的 `format: json_schema` / `tool_choice: required` 是 SDK 级能力。dsh 目前只有子代理返回值的 `outputSchema` 校验（语义不同），没有 provider 侧约束。opencode-omo 需要它来实现 opencode 结构化输出保真；omo 自身常规路径不用它，所以这是完整对齐的最后一项 medium 差距。

### Current state

- `packages/llm/llm/src/types.ts:320-355`：`GenerateOptions` 只有 `provider/model/messages/system/tools/temperature/maxTokens/stop/signal/sessionId/purpose`。
- `packages/llm/llm/src/call-config.ts:24-32`：`LlmCallConfig` 只有 `provider/model/reasoningEffort/temperature/maxTokens/stop`。
- loop-built 请求在 `llm/stream` 前 deep-frozen，listener 不能改写（`packages/llm/llm/src/index.ts:52-62`）。

### Proposal

在 `GenerateOptions`、`LlmCallConfig`、`EpochHeader` 增加两个可选字段：
- `format?: { type: 'json_schema'; schema: Record<string, unknown> }`
- `toolChoice?: 'auto' | 'required' | { name: string }`

`prepareCall` 对 provider capability 校验；adapter 在 OpenAI 兼容端点映射 `response_format` / `tool_choice`，不支持时显式拒绝。`callConfigEquals` / `canonicalHeader` 纳入两个字段（epoch 级）。

### Appendix: patch（类型层示意）

```diff
--- a/packages/llm/llm/src/types.ts
+++ b/packages/llm/llm/src/types.ts
@@
 export interface GenerateOptions {
   provider: string
   model: string
   reasoningEffort?: ReasoningEffortId
   messages: Message[]
   system?: string
   tools?: ToolSchema[]
   temperature?: number
   maxTokens?: number
   stop?: string[]
+  format?: { type: 'json_schema'; schema: Record<string, unknown> }
+  toolChoice?: 'auto' | 'required' | { name: string }
   signal?: AbortSignal
   sessionId?: Branded<'SessionId'>
   purpose?: 'compaction' | 'session-title'
 }
```
（同字段补入 `LlmCallConfig`；adapter 映射需在各自 adapter PR 中实现。）

### Questions to confirm

1. `format`/`toolChoice` 是否应成为 `request/header` 的 epoch 字段（影响缓存重用），还是请求级透传？
2. 不支持该能力的 adapter 是拒绝调用还是静默忽略？

### Related

- opencode `reference/opencode/packages/opencode/src/session/prompt.ts` 的 format 路径
- dsh `packages/subagent/subagent/src/types.ts` 的 `outputSchema`（仅返回值校验）
