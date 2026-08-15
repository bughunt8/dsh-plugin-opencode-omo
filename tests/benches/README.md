# opencode-omo 等价性 bench

目标：在同一台机器上分别启动一个独立端口的 dsh（`opencode-omo` 模式）与一个 `opencode + oh-my-openagent`，二者均使用 DeepSeek V4 Pro（`dpsk v4 pro`），在分级公开 bench 上对比行为。

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
