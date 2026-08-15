# dsh 侧修改补丁

本目录保存 opencode-omo 需要的最小 dsh 侧修改，按功能拆分。插件其余能力全部基于 dsh 原生 seam，不需要其它补丁。

- `0001-agent-pre-step-assistant-prefill.patch`
  - 功能：给 `PreStepDecision` 增加可选 `assistantPrefill`，并在进入模型请求前以 assistant 角色落盘。opencode-omo 用它恢复 opencode 的 `MAX_STEPS_PROMPT` assistant-role prefill 语义。
  - 影响文件：
    - `packages/core/agent/src/runtime-types.ts`
    - `packages/core/agent-loop/src/agent.ts`
    - `packages/core/agent-loop/tests/interception.spec.ts`
  - 应用方式（在 deepseek-harness checkout 的 `dev` 或对应基线）：
    ```sh
    git apply /path/to/dsh-plugin-opencode-omo/patches/0001-agent-pre-step-assistant-prefill.patch
    npm run build:lib:host
    npx vitest run packages/core/agent-loop/tests/interception.spec.ts
    ```
  - 未打此补丁时：插件其余功能仍可运行，但 `agent/pre-step` 返回的 `assistantPrefill` 会被旧 loop 忽略，因此 **maxSteps 提示不会注入**；maxSteps 保真依赖此补丁。

补丁生成基线：`dev = master(47f9438) + 3811c90 + 1a9442d`。
