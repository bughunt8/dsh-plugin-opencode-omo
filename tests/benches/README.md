# opencode-omo 等价性 bench

目标：在同一台机器上分别启动一个独立端口的 dsh（`opencode-omo` 模式）与一个 `opencode + oh-my-openagent`，二者均使用 DeepSeek V4 Pro（`dpsk v4 pro`），在分级公开 bench 上对比行为。

科学方法学（配对设计、统计检验、TOST、A/A、轨迹对齐、缓存/延迟协议）见 [`docs/exps/2026-08-16-scientific-bench-methodology.md`](../../docs/exps/2026-08-16-scientific-bench-methodology.md)。本目录脚本按该方案分层：当前实现对应 L0 静态审计（单元测试）、L3 端到端任务（run/eval）与 L4 性能遥测（metrics/perf）。

## 级别与 bench

| Level | Bench | 数据来源 | 对比重点 |
|---|---|---|---|
| L1 | HumanEval | <https://github.com/openai/human-eval> | pass@1、最终答案、CoT（reasoning 块） |
| L2 | MBPP | <https://github.com/google-research/google-research> | pass@1、工具调用链（读题/写文件/跑测试） |
| L3 | SWE-bench-verified-mini（抽样） | <https://modelscope.cn/datasets/evalscope/swe-bench-verified-mini> | 补丁、FAIL_TO_PASS 测试、工具链 |

bench 原始数据一律下载到 `tests/benches/.data/`，**不进入版本管理**。

## 前置

- `dsh`：本仓库插件 + `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` 的 web profile（实验用独立 `$DSH_HOME`）。
- `opencode`：机器已安装 opencode 1.17.11 与 oh-my-openagent；实验用独立 `XDG_CONFIG_HOME`，配置 `dpsk/deepseek-v4-pro`。
- 环境变量：`DEEPSEEK_API_KEY`（dsh 与 opencode 共用）、可选 `DSH_ROOT`、`DSH_HOME_BENCH`、`OPENCODE_CONFIG_HOME`、`DSH_PORT`。脚本不硬编码任何本机绝对路径/密钥。

## 冒烟验证（本机已验证）

```sh
# dsh 侧：独立 home + web profile
DSH_HOME=$PWD/.bench/adhoc-home \
  node "$DSH_ROOT/apps/cli/lib/bin.js" \
  --profile omo-web --host 127.0.0.1 --port 4618

# POST /api/session.create (agentPreset=opencode-omo) → /api/session.prompt →
# 轮询 /api/session.list → GET /api/session.export?sessionId=...
# 导出 zip 内 JSONL 含 request/header、assistant/chunk（含 reasoning）、tool/* 等完整事件。

# opencode 侧：独立 XDG_CONFIG_HOME
XDG_CONFIG_HOME=$PWD/.bench/opencode-home DEEPSEEK_API_KEY=... \
  opencode run --format json --agent "Sisyphus - ultraworker" \
  -m dpsk/deepseek-v4-pro "task"
# 输出为 JSONL（step_start/text/step_finish/...）；完整 transcript 用 `opencode export <sessionID>`。
```

注意：opencode 对官方 DeepSeek 接口当前不会把 `reasoning_content` 暴露为 reasoning part（AI SDK 兼容层不映射），dsh 会记录 `assistant/chunk` reasoning 块；CoT 对比脚本对此显式记录并做“有/无 reasoning 暴露”的适配对比。

## 性能对比（缓存命中 / 工具调用时间）

`run_bench.mjs` 保存的原始 transcript 已包含两边的 token usage 与工具时间戳，可离线重放计算，不需要重新调用模型：

```sh
# 分级 bench：逐题指标 + 聚合指标，输出 <run-dir>/metrics.json
node eval_perf.mjs .runs/human-eval-seed1
node eval_perf.mjs .runs/mbpp-seed1

# L3 抽样：dsh.json + opencode.json 目录
node eval_swe_perf.mjs .runs/swe-sphinx-doc__sphinx-10323
```

`bench_metrics.mjs` 统一两种 transcript 的字段口径：

- 缓存：dsh `assistant/message.data.usage.{inputTokens,outputTokens,reasoningTokens,cacheReadTokens,cacheWriteTokens}`；opencode `message.info.tokens.{input,output,reasoning,cache.read,cache.write}`。缓存命中率 = `cacheRead / (input + cacheRead)`。
- 工具时间：dsh `tool/call.time` → 对应 `tool/result.time`（按 `callId` 配对）；opencode 使用事件流 `tool_use.part.state.time.{start,end}`（`opencode export` 不落盘这两个字段，必须保存 `run --format json` 的事件流）。
- 步级时延：TTFT 为 `step/start` 到首个流式 chunk（dsh）/ `step_start` 到首个 reasoning/text/tool_use（opencode）。

当前 `dpsk v4 pro` 性能结论见 `docs/exps/2026-08-15-opencode-omo-equivalence-bench.md` 的性能章节（L1 seed3 / L2 seed2 公平重跑）；原始指标保存在对应 `.runs/*/metrics.json`。

公平性修正（本目录脚本已内置）：

- `run_bench.mjs` 为两个系统各建一个临时工作目录，避免一方写出的 `solution.py` 污染另一方。
- `opencode_runner.mjs` 显式传 `--dir` 并同步 `$PWD`：旧版 `opencode run` 从 `$PWD` 而非进程 cwd 解析目录，Node `spawn({cwd})` 会被忽略。
- `run_swe_sample.mjs` 为 dsh / opencode 各建一个 Python venv，避免一方 `pip install` 的结果被另一方复用（影响 L3 工具时间）。
- MBPP 没有 `entry_point` 字段：`bench_common.mbppEntryPoint()` 从首个 `assert fn(...)` / 参考代码 `def fn` 推断函数名。旧 prompt 写死 `Function name: undefined`，是 MBPP 上两系统行为分歧的主因；修复后 prompt 与判题脚本统一使用推断名。

## 科学方法学实验（配对重复 + 统计检验）

按方法学文档分层新增：

```sh
# A/A 噪声地板（同一系统自比）
node run_aa.mjs human-eval 10 2 dsh 200     # .runs/aa-dsh-.../
node run_aa.mjs human-eval 10 2 opencode 201
node eval_aa.mjs .runs/aa-dsh-human-eval-n10-r2-s200

# L1 指令/身份/工具契约探针（12 个 probe × repeats）
node run_probes.mjs 3 100
node eval_probes.mjs .runs/probes-r3-s100

# L3 多任务 × 多重复，交替运行顺序（even repeat dsh 先，odd repeat opencode 先）
node run_exp.mjs human-eval 30 3 300        # .runs/exp-human-eval-n30-r3-s300/
node run_exp.mjs mbpp 30 3 301

# 统计汇总：pass@1 配对检验 + bootstrap CI + TOST + 轨迹对齐 + 性能配对
node eval_exp.mjs .runs/exp-human-eval-n30-r3-s300
node eval_exp.mjs .runs/exp-mbpp-n30-r3-s301
```

- `eval_stats.mjs`：McNemar、精确二项、配对 bootstrap CI、paired t / Wilcoxon / Hodges-Lehmann、TOST。
- `trace_align.mjs`：工具调用序列归一化、Levenshtein 距离、首次分歧点、逐工具计数差。
- `eval_exp.mjs` 同时把 `bench_metrics.mjs` 的性能指标纳入配对比较（wall / cache 命中率 / TTFT / step / bash / write）。
- 每个 repeat 都是全新独立 workdir；A/B/A/B 交替顺序；原始 transcript 全部落在 `.runs/`（不入库）。
