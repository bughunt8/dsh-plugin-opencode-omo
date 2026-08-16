# opencode-omo 等价性 bench 实验报告

- 日期：2026-08-15
- 被测系统：
  - **dsh**：本插件 `opencode-omo` 模式，`DSH_HOME` 隔离，web profile，独立端口。
  - **opencode**：机器已安装 opencode 1.17.11 + oh-my-openagent，`XDG_CONFIG_HOME` 隔离。
- 模型：二者统一 `deepseek-official/deepseek-v4-pro`（dpsk v4 pro）。
- 复现：`tests/benches/`（`fetch-benches.sh`、`setup-homes.sh`、`run_bench.mjs`、`eval_bench.mjs`、`bench_metrics.mjs`、`eval_perf.mjs`、`eval_swe_perf.mjs`）；原始 transcript 在 `tests/benches/.runs/`（不入库）。

## 0. Bench harness 修复记录（2026-08-16）

- **MBPP `entry_point` 伪影（本报告最重要的一处修复）**：MBPP 行没有 `entry_point` 字段，旧脚本把 prompt 与判题都写成 `Function name: undefined` / `from solution import undefined`，而测试断言调用真实函数名。两个系统都在和伪影搏斗，导致 pass/trace 分歧与虚高的 A/A 噪声。新增 `bench_common.mbppEntryPoint()`（从首条 `assert fn(...)` 或参考代码 `def fn` 推断函数名）并同步修 `eval_bench/eval_exp/eval_aa`；修正后 MBPP 5×2 双方 10/10、A/A 零差异，轨迹距离 3.9 → 1.2（见 §6.4）。
- **共享工作目录污染**：`run_bench.mjs` 原让两系统共用一个 workdir，先跑一方的 `solution.py` 会泄漏给另一方；已改为每系统独立 workdir。
- **opencode cwd 解析**：`opencode run` 从 `$PWD` 而不是 spawn 的 `cwd` 解析工作目录；`opencode_runner.mjs` 已显式传 `--dir` 并同步 `$PWD`。
- **SWE 环境污染**：`run_swe_sample.mjs` 已改为每系统独立 venv（`--system-site-packages` + `--no-deps -e .`）并加 FAIL_TO_PASS 复验。

## 1. 设计

每个 bench 任务使用同一 prompt：在临时工作目录中用文件工具创建 `solution.py`，然后运行给定测试直到通过。分别记录：

- **最终行为**：`solution.py` 通过参考测试与否（pass@1）。
- **CoT**：transcript 中 reasoning 块的字符数。
- **工具链**：工具调用名称序列（read/write/edit/bash/subagent…）。
- **最终答案相似度**：最终文本的 token Jaccard（作为行为漂移的弱代理）。
- **性能**：缓存命中率、TTFT、step 时长、逐工具耗时（§5）。

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
| HumanEval | 5 | **1.00** | **1.00** | **1.00** | 0.207（seed3 公平重跑） |
| MBPP | 5 | **1.00** | **1.00** | **1.00** | 0.365（entry_point 修正后 seed303；旧 0.80/0.80 是 prompt 伪影，见 §0/§6.4） |

### 3.2 工具链对比

- dsh 典型工具链：`write` → `bash`（测试失败时循环 `write` → `bash`）。
- opencode 典型工具链：**公平重跑（独立工作目录）后同样为 `write` → `bash`**；旧记录里“多一次 read/第二次 write”是共享工作目录的伪差异（opencode 第一次 write 撞上 dsh 留下的 `solution.py` 后改用 read+write 修复）。
- MBPP 公平重跑（entry_point 修正后）：两系统均为 `write → bash`（失败时 `write/edit → bash`），不再出现旧 prompt 伪影导致的 builtins hack 与提前停手；opencode 偶尔多一次 read/write 回读。
- 二者都在失败时执行“修改→重跑测试”的修复循环；无系统出现发散性工具滥用。

### 3.3 CoT 暴露对比

| level | dsh reasoning 字符（均值） | opencode reasoning 字符（均值） | 观察 |
|---|---|---|---|
| HumanEval | 293 | 278 | 同数量级；公平重跑后差距消失 |
| MBPP | 7540 | 15532 | 同数量级；opencode 在失败修复回合暴露更多 reasoning |

说明：dsh 对 DeepSeek `reasoning_content` 的记录方式与 opencode 不同，数值不是“思考质量”的直接度量；这里只报告**暴露量**。行为等价性由 pass@1 与工具链判定。

### 3.4 逐题

见 `tests/benches/.runs/*/` 原始 JSON 与 eval 输出。典型：

- HumanEval 全部 5/5 双通过（seed3）。
- MBPP 第 1 题双失败、2/3/4/5 双通过（seed2），一致率 100%。

## 4. L3 SWE-bench-verified-mini 抽样结果

- 样本：`sphinx-doc__sphinx-10323`（`literalinclude` prepend/append 缩进 bug），`sphinx-doc/sphinx` base commit `31eba1a7`。
- 两个系统都在同一 checkout 上修复（先 dsh 记录 diff 后 reset 到 base，再 opencode 修复）。

| 指标 | dsh opencode-omo | opencode+omo |
|---|---|---|
| `git diff` | 1719 字符 | 1719 字符，**逐字节相同** |
| 工具链 | `bash → grep → read → … → edit → 反复 bash 跑测试` | `bash → read → … → edit → 反复 bash 跑测试` |
| reasoning 暴露 | 5714 字符 | 6041 字符 |

结论：在仓库级真实 bug 修复任务上，两个系统产生了**完全相同的补丁**，工具链与推理暴露量同构。L3 数据说明 opencode-omo 模式在 agent 行为上与 opencode+omo 等价（此样本）。

## 5. 性能对比（缓存命中 / 工具调用时间）

指标由 `tests/benches/bench_metrics.mjs` 从原始 transcript 离线归一：dsh 读 `assistant/message.data.usage` 与 `tool/call→tool/result` 配对时间；opencode 读 `message.info.tokens` 与事件流 `tool_use.part.state.time`。缓存命中率 = `cacheRead / (input + cacheRead)`。复现命令见 `tests/benches/README.md`（`eval_perf.mjs` / `eval_swe_perf.mjs`）。

### 5.1 HumanEval（seed=3 公平重跑，前 5 题）

| 指标 | dsh opencode-omo | opencode+omo |
|---|---|---|
| 请求数 | 15 | 15 |
| 输入 tokens（未命中） | 113 638 | 164 080 |
| 缓存读 tokens | 228 992 | 458 880 |
| **缓存命中率** | **66.8%** | **73.7%** |
| 平均 wall time | 17.6 s | 11.1 s |
| 平均 TTFT | 1761 ms | 2921 ms |
| 平均 step 时长 | 5804 ms | 3506 ms |
| bash 平均时长（各 5 次） | **7277 ms** | **12 ms** |
| write 平均时长 | 15 ms | 39 ms |
| 工具错误 | 0 | 0 |

- 本表来自 `run_bench.mjs` 修复后的公平重跑：每系统独立临时工作目录，opencode 显式 `--dir`（旧版 `opencode run` 从 `$PWD` 解析目录，spawn 的 `cwd` 会被忽略）。两条工具链现在都是 `write → bash`，无伪 error。
- 缓存差距主要来自 prompt 长度与首步命中：dsh 首个请求约 22.5k tokens（0 命中），opencode 首个请求约 32.7k tokens 且系统提示部分已命中 8.6k；后续步骤两者都接近全量命中。
- dsh 的 `bash` 调用包含 persistent PTY shell 的首次启动/收尾开销（约 7.3 s），而 opencode 的 bash server 常驻（10–16 ms）；这是 dsh wall time 高出的主因。TTFT 上 dsh 反而更快（1.8 s vs 2.9 s）。

### 5.2 MBPP（seed=2 公平重跑，前 5 题）

| 指标 | dsh opencode-omo | opencode+omo |
|---|---|---|
| 请求数 | 26 | 35 |
| **缓存命中率** | **81.7%** | **86.2%** |
| 平均 wall time | 53.6 s | 77.6 s |
| 平均 TTFT | 1652 ms | 11382 ms |
| 平均 step 时长 | 10.3 s | 12.0 s |
| bash 平均时长 | **5449 ms** | **10 ms** |
| read/write/edit 平均时长 | 14 / 13 / 14 ms | 45 / 22 / 16 ms |
| 工具错误 | 0 | 7（write 撞已存在文件，真实语义） |

- 缓存命中率随多轮修复循环上升：dsh 81.7%，opencode 86.2%（后者输入体更大，命中池也更大）。
- TTFT 在 MBPP 上 opencode 明显更高（11.4 s vs 1.7 s），抵消了其 bash 常驻优势，dsh wall time 反而更低（53.6 s vs 77.6 s）。
- dsh `bash` 的约 5.4 s 开销同样是 persistent PTY 的固定启动/收尾成本，命令本身与 opencode 一致。

### 5.3 L3 SWE-bench 抽样（`sphinx-doc__sphinx-10323`）

| 指标 | dsh opencode-omo | opencode+omo |
|---|---|---|
| **缓存命中率** | **94.6%** | **93.6%** |
| wall time | 863.8 s | 72.7 s |
| 请求数 | 21 | 17 |
| bash 次数 | 15 | 13 |
| bash 平均时长 | 53.4 s | 671 ms |

> ⚠️ 本轮 L3 的 wall time / bash 时长不可直接对比：旧脚本让两个系统共用同一 Python 环境，dsh 侧先执行了多次 `pip install -e .` / `pip install --target …`（最大单次 293 s），opencode 侧随后复用了这些安装。`run_swe_sample.mjs` 已改为每个系统独立 venv，后续重跑才有公平的工具时间对比；缓存命中率不受该环境污染影响。

## 6. 扩展实验（科学方法学，2026-08-16）

### 6.1 L1 探针

12 个定制 probe × 3 轮（身份、模型自报、格式、算术、文件读写、代码运行、多步、shell 持久性等）：两系统 **36/36 全部通过**，McNemar/精确二项 p=1，TOST(±5pp) 判为等价。

### 6.2 A/A 噪声地板（HumanEval 前 10 题 × 2 轮）

- dsh 自比：20/20 双方全通过，差异 0、CI=[0,0]。
- opencode 自比：20/20 双方全通过，差异 0、CI=[0,0]。
- MBPP dsh 自比（修正后 5 题 × 2 轮）：10/10 双方全通过，差异 0、CI=[0,0]，TOST(±5pp) 等价。
- MBPP opencode 自比（修正后 5 题 × 2 轮）：10/10 双方全通过，差异 0、CI=[0,0]，TOST(±5pp) 等价。
- 旧 MBPP A/A 记录的 ±10pp 级“噪声”不是真实模型噪声，而是 prompt 伪影（`Function name: undefined`，见 §6.4）造成的评估噪声；修正 prompt 后 A/A 回到零差异。

### 6.3 HumanEval 30 题 × 3 轮（paired，交替顺序）

| 指标 | dsh opencode-omo | opencode+omo | 差异（95% CI） |
|---|---|---|---|
| pass@1（repeat 级） | **90/90** | **90/90** | 0（[0, 0]），TOST 等价 |
| 工具轨迹相似度 | – | – | 0.941（平均编辑距离 0.122） |
| 平均工具调用数差 | – | – | 0.011 |
| wall time (ms) | 17886 | 9950 | +7936（[7035, 9256]） |
| cache read 命中率 | 66.7% | 73.4% | −6.7pp（[−7.3, −5.9]） |
| TTFT (ms) | 2136 | 2645 | −508（[−851, −42]） |
| step 时长 (ms) | 5832 | 3079 | +2753（[2463, 3188]） |
| bash 工具时长 (ms) | 7291 | 16.9 | +7274（[7228, 7302]） |
| write 工具时长 (ms) | 12.0 | 49.4 | −37.4（[−40.9, −33.6]） |

- pass/轨迹层面：30 题 × 3 轮无任何分歧，等价性在“任务成功”与“动作序列”两层都成立。
- 性能层面：差异全部统计显著（paired t 均 p<0.03，多数 p<1e-13），但方向稳定且可解释——dsh 的 persistent PTY bash 有约 7.3s 固定开销，opencode 的 write 多约 37ms；TTFT 上 dsh 反而更快。

### 6.4 最终（MBPP + SWE，2026-08-16）

MBPP A/A（修正后 5 题 × 2 轮）：dsh 与 opencode 均为 10/10 全通过，自比差异 0、CI=[0,0]，TOST 等价。

MBPP 5 题 × 2 轮（修正后）：dsh 10/10、opencode 10/10；discordant=0，McNemar/精确二项 p=1，TOST(±10pp)=true。轨迹相似度 0.685，平均编辑距离 1.2，工具数差 −0.4，Jaccard 0.365。

| 指标 | dsh opencode-omo | opencode+omo | 差异（95% CI） |
|---|---|---|---|
| wall time (ms) | 19110.0 | 12307.7 | 6802.3 [5345.9, 8062.1] |
| cache read 命中率 | 0.684 | 0.755 | −0.072 [−0.116, −0.030] |
| TTFT (ms) | 1542.8 | 2795.6 | −1252.8 [−1894.3, −780.9] |
| step 时长 (ms) | 5854.4 | 3156.0 | 2698.4 [1664.8, 4132.7] |
| bash 工具时长 (ms) | 7108.8 | 14.7 | 7094.1 [6720.1, 7301.3] |
| write 工具时长 (ms) | 14.5 | 40.1 | −25.6 [−35.2, −13.7] |

**MBPP 分歧根因**：MBPP 数据没有 `entry_point` 字段，旧 prompt/判题脚本写死了 `Function name: undefined`。两个系统都在和这个基准伪影搏斗（推理里出现大量“从 solution import undefined 但 assert 调真实函数名”的纠结），opencode 更常提前停手 → 造成 pass/trace 分歧与虚高的 A/A 噪声。`bench_common.mbppEntryPoint()` 从首条 `assert fn(...)` 推断真实函数名后，两个系统 10/10 通过、轨迹距离从 3.9 降到 1.2。**不是技能集差异**：本实验 opencode 隔离配置只有 `oh-my-openagent`（无其它插件），且修正前后两边都没有调用 `skill` 工具。

SWE-bench 新实例（独立 venv + FAIL_TO_PASS 复验）：

- `sphinx-doc__sphinx-10435`（新实例）：首次运行因 partial-clone 需要向 GitHub 补取 blob 失败；补齐后重试时 dsh 会话超过 20 分钟运行上限，未产出 patch/FAIL_TO_PASS 结果。本实例**无有效对比数据**；L3 仍以旧实例 `sphinx-10323`（逐字节相同 diff）为唯一仓库级证据。


## 7. 结论

- L1/L2（独立工作目录公平重跑）：pass@1 与逐题通过模式完全一致（HumanEval 5/5 vs 5/5，MBPP 4/5 vs 4/5，失败题也一致）。
- L3（抽样）：`sphinx-doc__sphinx-10323` 上两个系统产出**逐字节相同的 git diff**，工具链同构。
- 行为差异只体现在暴露层：opencode 工具链通常多一次 `read` 回读，reasoning 暴露量略高；dsh 的 reasoning 块记录更多随修复循环增长。这些不影响任务结果。
- 性能层已有归一指标：缓存命中率同数量级（L1 66.8% vs 73.7%，L2 81.7% vs 86.2%，L3 94.6% vs 93.6%）；TTFT 互有高低；dsh `bash` 调用因 persistent PTY 启动/收尾存在 5–7 s 级固定开销，是本模式与 opencode 最显著的非行为差异。
- **MBPP 修正后（5 题 × 2 轮）**：两系统 10/10 全通过，A/A 零差异，轨迹编辑距离 1.2。之前观察到的 pass/trace 分歧来自 benchmark prompt 伪影（`Function name: undefined`），不是 harness 或技能集差异。
- 当前结论：L1 探针、HumanEval 30×3、修正后 MBPP 5×2 均支持行为等价；SWE 新实例因运行超时未获得额外数据，仓库级证据仍为旧 `sphinx-10323` 逐字节相同 diff。
- 整体而言，**dsh opencode-omo 与 opencode+omo 在已验证任务上模型行为等价**；性能层差异（persistent PTY bash 约 5–7s、cache 命中率约 7pp、TTFT 方向性差异）稳定且可解释。
