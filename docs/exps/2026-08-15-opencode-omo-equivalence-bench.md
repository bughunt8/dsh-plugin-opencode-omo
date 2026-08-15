# opencode-omo 等价性 bench 实验报告

- 日期：2026-08-15
- 被测系统：
  - **dsh**：本插件 `opencode-omo` 模式，`DSH_HOME` 隔离，web profile，独立端口。
  - **opencode**：机器已安装 opencode 1.17.11 + oh-my-openagent，`XDG_CONFIG_HOME` 隔离。
- 模型：二者统一 `deepseek-official/deepseek-v4-pro`（dpsk v4 pro）。
- 复现：`tests/benches/`（`fetch-benches.sh`、`setup-homes.sh`、`run_bench.mjs`、`eval_bench.mjs`）；原始 transcript 在 `tests/benches/.runs/`（不入库）。

## 1. 设计

每个 bench 任务使用同一 prompt：在临时工作目录中用文件工具创建 `solution.py`，然后运行给定测试直到通过。分别记录：

- **最终行为**：`solution.py` 通过参考测试与否（pass@1）。
- **CoT**：transcript 中 reasoning 块的字符数。
- **工具链**：工具调用名称序列（read/write/edit/bash/subagent…）。
- **最终答案相似度**：最终文本的 token Jaccard（作为行为漂移的弱代理）。

级别：

| Level | bench | 样本 | 备注 |
|---|---|---|---|
| L1 | HumanEval | 5（seed=1，前 5 题） | pass@1 + 工具链 |
| L2 | MBPP | 5（seed=1，前 5 题） | 同上 |
| L3 | SWE-bench-verified-mini | 计划抽样 1-2 | 仓库级 agent 任务，见 §4 |

## 2. 环境

- opencode 端独立配置：
  ```json
  {
    "plugin": ["oh-my-openagent@latest"],
    "model": "dpsk/deepseek-v4-pro",
    "provider": { "dpsk": { "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "{env:DEEPSEEK_API_KEY}" } } }
  }
  ```
- dsh 端：隔离 `$DSH_HOME`，bundle = `dsh-base + dsh-web-app + @royenheart/dsh-plugin-opencode-omo`，默认模型 `deepseek-official/deepseek-v4-pro`。
- API key 只从 `DEEPSEEK_API_KEY` 环境变量注入。

## 3. L1/L2 结果

### 3.1 汇总

| level | n | dsh pass@1 | opencode pass@1 | 逐题一致率 | 平均最终文本 Jaccard |
|---|---|---|---|---|---|
| HumanEval | 5 | **1.00** | **1.00** | **1.00** | 0.123 |
| MBPP | 5 | **0.80** | **0.80** | **1.00** | 0.264 |

### 3.2 工具链对比

- dsh 典型工具链：`write` → `bash`（测试失败时循环 `write` → `bash`）。
- opencode 典型工具链：`write` → `read` → `write` → `bash`（opencode 默认多一次 read 回读，符合其 edit/read 提示）。
- 二者都在失败时执行“修改→重跑测试”的修复循环；无系统出现发散性工具滥用。

### 3.3 CoT 暴露对比

| level | dsh reasoning 字符（均值） | opencode reasoning 字符（均值） | 观察 |
|---|---|---|---|
| HumanEval | 253 | 371 | opencode 暴露更多 reasoning part |
| MBPP | 10466 | 11997 | 同数量级；二者均随修复循环增长 |

说明：dsh 对 DeepSeek `reasoning_content` 的记录方式与 opencode 不同，数值不是“思考质量”的直接度量；这里只报告**暴露量**。行为等价性由 pass@1 与工具链判定。

### 3.4 逐题

见 `tests/benches/.runs/*/` 原始 JSON 与 eval 输出。典型：

- HumanEval 全部 5/5 双通过。
- MBPP 1/2/3/5 双通过；第 4 题双失败（同一题双系统都未通过），一致率 100%。

## 4. L3 SWE-bench-verified-mini 抽样结果

- 样本：`sphinx-doc__sphinx-10323`（`literalinclude` prepend/append 缩进 bug），`sphinx-doc/sphinx` base commit `31eba1a7`。
- 两个系统都在同一 checkout 上修复（先 dsh 记录 diff 后 reset 到 base，再 opencode 修复）。

| 指标 | dsh opencode-omo | opencode+omo |
|---|---|---|
| `git diff` | 1719 字符 | 1719 字符，**逐字节相同** |
| 工具链 | `bash → grep → read → … → edit → 反复 bash 跑测试` | `bash → read → … → edit → 反复 bash 跑测试` |
| reasoning 暴露 | 5714 字符 | 6041 字符 |

结论：在仓库级真实 bug 修复任务上，两个系统产生了**完全相同的补丁**，工具链与推理暴露量同构。L3 数据说明 opencode-omo 模式在 agent 行为上与 opencode+omo 等价（此样本）。

## 5. 结论

- L1/L2：pass@1 与逐题通过模式完全一致（HumanEval 5/5 vs 5/5，MBPP 4/5 vs 4/5，失败题也一致）。
- L3（抽样）：`sphinx-doc__sphinx-10323` 上两个系统产出**逐字节相同的 git diff**，工具链同构。
- 行为差异只体现在暴露层：opencode 工具链通常多一次 `read` 回读，reasoning 暴露量略高；dsh 的 reasoning 块记录更多随修复循环增长。这些不影响任务结果。
- 在当前 bench 上，**dsh opencode-omo 与 opencode+omo 模型行为等价**。
