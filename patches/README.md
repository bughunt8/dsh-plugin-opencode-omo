# dsh 侧修改补丁

本目录保存 opencode-omo 需要的最小 dsh 侧修改，按功能拆分。插件其余能力全部基于 dsh 原生 seam，不需要其它补丁。

- `0001-agent-pre-step-assistant-prefill.patch`
  - 功能：给 `PreStepDecision` 增加可选 `assistantPrefill`；loop 不把它写入 session，而是追加在本 step 请求的派生历史之后，并记入 `request/header`（invariant companion 与 token-meter 同步参与重建/计价）。opencode-omo 用它恢复 opencode 的 `MAX_STEPS_PROMPT` assistant-role prefill 语义，且不污染 transcript/stats/compaction。
  - 影响文件：
    - `packages/core/agent/src/runtime-types.ts`
    - `packages/core/agent-loop/src/agent.ts`
    - `packages/core/agent-loop/src/invariant.ts`
    - `packages/core/agent-loop/tests/interception.spec.ts`
    - `packages/core/session/src/types.ts`
    - `packages/core/session/src/request-header.ts`
    - `packages/llm/token-meter/src/estimate.ts`
  - 应用方式（在 deepseek-harness checkout 的 `dev` 或对应基线）：
    ```sh
    git apply /path/to/dsh-plugin-opencode-omo/patches/0001-agent-pre-step-assistant-prefill.patch
    npm run build:lib:host
    npx vitest run packages/core/agent-loop packages/core/session packages/llm/token-meter packages/session/session-stats
    ```
  - 未打此补丁时：插件其余功能仍可运行。host 插件通过扫描已安装 `@deepseek-ai/dsh-agent-loop` 的编译产物检测该能力；检测不到时 `agent/pre-step` 触发同一文本的 **system-prompt section** 注入 `MAX_STEPS_PROMPT`（不再静默丢失，仅位置从 assistant 尾部降级为 system 前缀），并通过浏览器 `Toast` 提示用户应用本补丁。maxSteps 的完全保真仍依赖此补丁。

补丁当前基线：`dsh-v0.1.1-rc.2`（tag，`b150a55`）。该 tag 尚未吸收此能力，`master` 的 `runtime-types.ts` 目前也没有该字段；`git apply --check` 与应用后受影响包 `tsc -b`、vitest 均通过。补丁遵循 dsh 官方设计约束：`2026-07-05-reconstructable-requests`（模型可见内容必须可从 session log 重建）与已归档的 `2026-07-07-session-prefix`（request-only 内容记入 `request/header`，不写 session message；当时仅因每步重付 token 丢弃 tail slot，而本补丁只在 listener 返回时才生效）。上游提案链接：
- https://github.com/deepseek-ai/deepseek-harness/discussions/2407 （本补丁对应的 feature request）
- https://github.com/deepseek-ai/deepseek-harness/discussions/3940 （相邻的消息改写扩展点提案，但不能提供 assistant-role 尾部续写语义）
