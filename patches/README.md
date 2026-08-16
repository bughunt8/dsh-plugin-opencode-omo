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
  - 未打此补丁时：插件其余功能仍可运行。host 插件通过扫描已安装 `@deepseek-ai/dsh-agent-loop` 的编译产物检测该能力；检测不到时 `agent/pre-step` 自动降级为**等文本的合成 user 消息**注入 `MAX_STEPS_PROMPT`（不再静默丢失，仅角色语义非 assistant），并通过浏览器 `Toast` 提示用户应用本补丁。maxSteps 的完全保真仍依赖此补丁。

补丁生成基线：`dev = master(47f9438) + 3811c90 + 1a9442d`。
