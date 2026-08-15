# @royenheart/dsh-plugin-opencode-omo

A DeepSeek Harness plugin that adds an `opencode-omo` agent preset (mode) to the web profile. The mode replicates the behavior of **opencode** + the **omo** plugin ([oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)), scoped to this mode only — other presets (`standard`/…) keep the default dsh loop, sandboxed fs, and no omo hooks.

## What the mode provides

- **opencode + omo system prompt** — the real opencode `default.txt` persona (tone, style, proactiveness, conventions, code style, task guidance) + omo's Sisyphus orchestrator identity, declared as the **complete** system prompt: the dsh harness identity and runtime-context snapshot are suppressed for this mode. The loop shim additionally prepends opencode's **live environment block** (exact model id, working dir, workspace root, git, platform, date, recomputed every step).
- **omo role picker in the composer** — in dsh's existing `conversation.input.left` tool-row slot (after the access/plan chips): `sisyphus`, `hephaestus` (Deep Agent), `prometheus` (Plan Builder), `atlas` (Plan Executor), `sisyphus-junior`, `athena`/`athena-junior`/`council-member`, `metis`, `momus`, `oracle`, `librarian`, `explore`, `multimodal-looker`. Selecting a role swaps the session's complete system prompt and applies that role's configured model.
- **全局“角色设置”** in the dsh settings panel (`settings.section`): per-role primary model dropdown (跟随当前 / fixed) under a centered 主模型 label; a dsh-style circle "+" button opens a fallback model list below the role box (repeatable additions, cancel/close adds nothing), persisted in `opencode-omo-roles` settings. On request failure the loop shim advances through the role's fallback chain before the harness retry policy runs.
- **opencode toolchain (complete)** — persistent `bash`, `read`/`write`/`edit`/`read_image`, `apply_patch`, `glob`/`grep`, `todo_write`, `skill`, `web_fetch`/`web_search`, `lsp`, `exit_plan_mode` (plan), `ask_user_question`. `tool-surface.mjs` overwrites the model-visible descriptions/parameters with opencode's `tool/*.txt` text and shims `read`/`edit`/`write` to opencode's parameter names.
- **omo `task()` surface** — `task-shim.mjs` registers the omo-style `task(category/subagent_type/load_skills/run_in_background/task_id)` invocation, mapping it onto dsh named subagents + generic delegation.
- **omo multi-role subagents** — `oracle` (read-only advisor), `librarian` (external docs/code search), `explore` (codebase grep), `metis` (pre-planning), `momus` (plan reviewer), `looker` (media), plus generic `subagent`/`subagent_fork` + `workflow`/`ralph`.
- **omo context injection** — AGENTS.md/CLAUDE.md walk-up + `skills/` + omo's `rules-injector` (`.omo/rules`, `.cursor/rules`, `.github/instructions`, `copilot-instructions.md`).
- **omo hooks** — `comment-checker` (rejects AI-slop comments on write/edit), `hashline` (read tagging `N#HH|content` + `hashline_edit` stale-ref guard).
- **per-mode execution backend** — local filesystem (`dsh-fs-local`) + persistent PTY shell, isolated from other modes' sandboxed fs/shell.
- **native-seam loop shim** — no dsh-side driver seam. `driver.mjs` is an ordinary preset plugin using the shipped seams: a dynamic `ctx.systemPrompt.section({ complete: true })` recomputes opencode's env block and the selected omo role prompt per assembly; `system-prompt/assemble` applies opencode's model tool gating; `agent/inbox/claimed`, `agent/pre-step`, `agent/request`, and `agent/request-error` provide ultrawork detection, maxSteps, role model routing, and fallback retry. Other presets are untouched by construction.

## Layout

```
cordis.patch.yml                 # bundle patch: self host row
install.py                       # idempotent install/uninstall (incl. user preset root)
src/                             # host + client plugin halves (role registry, settings, picker UI)
lib/                             # built host/client bundles (npm run build)
scripts/build.sh                 # typecheck + tsdown build
presets/opencode-omo/
  agent.cordis.yml               # the composition (tools, roles, hooks, LSP)
  preset.yml                     # display metadata
  persona.md                     # opencode default.txt + omo Sisyphus persona
  roles/*.md                     # subagent personas (also main-role prompts)
  roles/prompts/*.md             # primary-role complete prompts (hephaestus/prometheus/atlas/…)
  skills/                        # omo shared skills
  driver.mjs                     # native-seam loop shim (prompt/route/fallback/maxSteps/ultrawork)
  rules.mjs                      # rules-injector
  comment-checker.mjs            # comment-checker hook
  apply-patch.mjs                # apply_patch tool
  hashline.mjs                   # omo hashline read-tagging + hashline_edit
```

## Install

Build the package first (host + client bundles):

```sh
npm run build
```

`install.py` then automates install/uninstall idempotently — it symlinks the package into `~/.dsh/profiles/<profile>/node_modules/`, edits the profile's `package.json` (adds/removes the dependency + bundle entry), and publishes the preset through dsh's native user preset root as a real directory under `$DSH_HOME/.agent-presets/opencode-omo` (entries symlinked into the package, so updates stay live):

```sh
python3 install.py --profile web              # install (idempotent)
python3 install.py --profile web --uninstall  # remove
```

Manual alternative — the package is a dsh **bundle**: it declares `dsh.bundle.patch` and ships the preset. Load it into a profile:

```sh
dsh plugin --profile web add link:/path/to/dsh-plugin-opencode-omo
```

then add it to the profile's bundle list in `$DSH_HOME/profiles/web/package.json` and create the user-root preset directory yourself:

```json
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@royenheart/dsh-plugin-opencode-omo"] } }
```

```sh
mkdir -p "$DSH_HOME/.agent-presets/opencode-omo"
for f in /path/to/dsh-plugin-opencode-omo/presets/opencode-omo/*; do
  ln -s "$f" "$DSH_HOME/.agent-presets/opencode-omo/"
done
```

Restart dsh and select **opencode-omo** from the mode picker.

## Required dsh-side changes

**当前版本依赖一个 dsh 侧补丁**，必须应用到 deepseek-harness 后才能获得完整 maxSteps 保真；补丁位于 [`patches/`](patches/README.md)，按功能拆分：

- `patches/0001-agent-pre-step-assistant-prefill.patch` — 给 `PreStepDecision` 增加可选 `assistantPrefill`，让 loop 在模型请求前落一条 assistant 角色 prefill。插件用它恢复 opencode `MAX_STEPS_PROMPT` 的 assistant-role 语义。未打此补丁时插件其余功能可用，但 maxSteps 提示会被旧 loop 忽略。

```sh
cd /path/to/deepseek-harness
git apply /path/to/dsh-plugin-opencode-omo/patches/0001-agent-pre-step-assistant-prefill.patch
npm run build:lib:host
npx vitest run packages/core/agent-loop/tests/interception.spec.ts
```

- Provider-visible `format`/`toolChoice` 仍是提案（见 `DSH_CHANGE_PROPOSALS.md`），omo 常规路径不使用；standalone structured-output 插件覆盖常用场景。

Everything else runs on unmodified dsh seams: the preset is published through `$DSH_HOME/.agent-presets` and the composer picker occupies the existing `conversation.input.left` slot.

## Bench 实验（等价性验证）

实验脚本与复现说明在 [`tests/benches/`](tests/benches/README.md)，报告产物写入 `docs/exps/`。设计要点：

- 分别启动**独立端口**的 dsh（`opencode-omo` 模式，隔离 `$DSH_HOME`）和机器上已安装的 opencode + oh-my-openagent（隔离 `XDG_CONFIG_HOME`）。
- 二者统一使用 `deepseek-official/deepseek-v4-pro`（dpsk v4 pro）；API key 从 `DEEPSEEK_API_KEY` 环境变量注入，脚本不硬编码本机路径或密钥。
- 分级 bench：L1 HumanEval、L2 MBPP、L3 SWE-bench-verified-mini（抽样），对比 pass@1、CoT/reasoning 暴露、工具调用链（read/edit/write/bash/test/子代理）与最终补丁/答案。
- bench 原始数据下载到 `tests/benches/.data/`，**不进入版本管理**；`fetch-benches.sh` 可复现拉取，`setup-homes.sh` 可复现两个隔离 home。

### 已运行结果（dpsk v4 pro，seed=1 前 5 题）

| level | dsh pass@1 | opencode+omo pass@1 | 逐题一致率 |
|---|---|---|---|
| HumanEval | 1.00 | 1.00 | 1.00 |
| MBPP | 0.80 | 0.80 | 1.00 |
| SWE-bench-verified-mini 抽样 (`sphinx-doc__sphinx-10323`) | 相同 patch | 相同 patch | git diff 逐字节一致 |

完整实验报告：`docs/exps/2026-08-15-opencode-omo-equivalence-bench.md`；原始 transcript 在 `tests/benches/.runs/`。L3 SWE-bench-verified-mini 抽样运行与仓库级工具链对比见同一报告。

## Alignment status (audited against reference/opencode + reference/oh-my-openagent)

- **Aligned**: opencode default persona (complete system prompt + live env block, workspace root now derived as the git root); opencode tool families + gpt apply_patch/edit-write tool gating enforced on BOTH the model-visible schema and execution (`tools/pre-execute` deny mirror); opencode maxSteps + verbatim MAX_STEPS_PROMPT; verbatim opencode plan.txt / plan-mode.txt with dynamic `${planInfo}` and the plan→build BUILD_SWITCH reminder; omo role catalog/display names; sisyphus/hephaestus/atlas/sisyphus-junior + specialist subagents; comment-checker/hashline/rules-injector hooks; generated Sisyphus routing sections; extracted omo Sisyphus model-family templates (GPT-5.5/GPT-5.4/claude-opus-4-7/claude-opus-4-8/claude-fable-5/gemini/kimi-k3/kimi-k2-7/kimi-k2-6/glm-5-2, with the dynamic Sisyphus fallback for unknown families) plus hephaestus GPT variants, all 8 atlas variants, and specialist model variants (oracle/metis/momus); omo-default per-role PRIMARY model resolution (provider-scope ordered) and fallback chains that start AFTER the primary; omo role sampling defaults (sisyphus/hephaestus GPT effort medium, atlas temperature 0.1); omo-style retryable-error gating before fallback advance; reasoning-effort selectors in role settings; ultrawork keyword override; `/start-work`, `/remove-ai-slops`, `/refactor`, `/stop-continuation`, `/handoff`, `/hyperplan`, `/team-mode` commands; composer role picker + global per-role model/fallback settings; omo skills published as `user-dsh` so the third-party skills-manager can manage them. The omo rules-injector text is now folded into the complete system prompt (`driver.mjs` + `rules.mjs`) instead of being dropped by `suppressRuntimeContext()`; approved plans are persisted at `.opencode/plans/<created>-<session>.md`; specialist subagent personas now load the extracted reference prompt files (oracle/librarian/explore/metis/momus/multimodal-looker).
- **MCP**: separate plugin [`dsh-plugin-mcp-suppor`](../dsh-plugin-mcp-suppor) mounts native `@deepseek-ai/dsh-mcp-client` servers from composition config or the persisted `mcp-suppor` settings namespace.
- **Structured output**: separate plugin [`dsh-plugin-structured-output`](../dsh-plugin-structured-output) provides opencode-style `/json-schema` + `StructuredOutput` validation on native seams (no dsh-side format field).
- **Partial**: extracted family templates keep dynamic sections filled by dsh-native data rather than omo's builder output; structured output is tool-enforced rather than `tool_choice: required`; hooks are regex/simplified ports; AGENTS.md injection is dsh-native; child subagents inherit the session model because dsh child headers/descriptors do not carry the subagent role id (primary-role sampling defaults ARE applied).
- **Requires one dsh-side patch (see `patches/`, audited 2026-08-15)**: `PreStepDecision.assistantPrefill` for opencode's MAX_STEPS_PROMPT. Provider-visible `format`/`toolChoice` remains a proposal; omo's regular path does not use it and the standalone structured-output plugin covers the common route.

## Remaining gaps

1. **dsh-side（已提供补丁）**: `PreStepDecision.assistantPrefill`。未打 `patches/` 补丁时 maxSteps 提示会被旧 loop 忽略；补丁应用后该 gap 关闭。
2. **dsh-side（proposal，medium）**: `GenerateOptions.format` / `toolChoice`。omo 常规路径不使用；standalone structured-output 插件覆盖常用场景。
3. 子代理 per-role 采样无法可靠反查角色 id（dsh child header/descriptor 不带），主角色采样默认已应用；子代理继承会话模型。
4. Plan 文件：dsh 本体不落盘，插件已在 `exit_plan_mode` 批准后写 `.opencode/plans/*`；一等 plan-file seam 仍是可选改进。
5. team-mode TUI、comment-checker CLI、hashline diff enhancer 等非 LLM/编辑体验差异。

