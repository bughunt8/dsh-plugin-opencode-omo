# opencode-omo ↔ opencode+omo 一致性对比：科学方法学方案

- 日期：2026-08-16
- 目的：不再只问“两套系统最终答案是否一样”，而是回答两个更严格的问题：
  1. **行为等价**：相同模型（dpsk v4 pro）、相同 prompt、相同工具语义下，opencode-omo 与 opencode+omo 的可观察行为差异是否小于预先声明的边界？
  2. **实现保真**：如果出现差异，它来自模型随机性、prompt 漂移、工具 schema 漂移，还是 harness 执行路径不同？
- 方法来源：4 个并行调研 subagent 的文献/项目综述（2026-08-16）；本文件是面向本仓库的落地版本。引用文献见文末，2026 年 arXiv 编号多为预印本，结论按“需复核”对待。

## 1. 核心设计原则

1. **任务配对设计**：同一任务、同一模型、同一温度/effort、同一逐字节 prompt，分别在两个系统各跑一次以上。差异只按“同一任务的两条轨迹”成对比较，绝不做两个独立比例的直接比较——否则任务难度方差会淹没 harness 差异。
2. **评分与轨迹解耦**：最终裁决用可执行判据（单测通过、patch 应用、环境状态、schema 校验），不用自然语言相似度；轨迹（工具调用序列、参数、终止原因）只用于定位分歧，不直接计分。
3. **一次只变一个变量**：默认两系统只在 harness 不同；任何额外差异（prompt 文本、工具名、参数名、执行后端）都要先字节级对齐或显式登记为“已知差异”。
4. **先测噪声地板，再谈差异**：任何一致性结论必须建立在本仓库自己的 A/A 基线（同一系统跑两次）之上；没有 A/A 的 p 值没有意义。
5. **环境完整性干净**：每系统独立 `DSH_HOME` / `XDG_CONFIG_HOME`、独立工作目录、独立 venv、交替运行顺序、冷/热缓存分开报告。这六项本仓库已经修过一遍（`run_bench.mjs` 独立 workdir、`opencode_runner.mjs` 显式 `--dir`、`run_swe_sample.mjs` 独立 venv）。

## 2. 分层方案（L0–L5）

### L0 静态/确定性输入审计（无 LLM，秒级）

目的：确认“喂给模型的输入是否等价”，这是所有行为对比的前提。

- **prompt 字节级对齐**：对每个角色/家族模板做 `diff`，记录两侧最终 system prompt 的规范化 diff（去时间戳/路径）。现有 `tests/` 已覆盖 persona 存在性，需补“等价性 diff”而不是“存在性断言”。
- **工具 schema 对齐**：把 opencode 的 `tool/*.txt` 解析出的 name/description/parameters 与 dsh 的模型可见 schema 做 JSON diff；输出“仅描述差异、参数差异、缺失/多余工具、默认值差异”四类。GPT 家族的 `apply_patch`/`edit-write` gating 矩阵要逐模型家族列表化。
- **事件字段归一**：dsh `usage.{inputTokens,outputTokens,reasoningTokens,cacheReadTokens,cacheWriteTokens}` ↔ opencode `info.tokens.{input,output,reasoning,cache.read,cache.write}`；工具时间 dsh `tool/call→tool/result` ↔ opencode `tool_use.part.state.time.{start,end}`。已有 `bench_metrics.mjs`，继续作为唯一口径。

### L1 指令/身份保真探针（有 LLM，短 prompt，低成本）

目的：检测重实现是否丢段、重排、弱化 prompt 内容。

- **IFEval / FollowBench 子集**（各 50–100 条，可程序化判定）：两侧跑同一约束集，比较“可验证约束通过率”。差异按约束类别归因（长度/格式/URL/JSON/大小写/多轮）。
- **本仓库定制探针**（优先）：
  - 身份：`你是谁`、`你的模型是什么`、`你运行在哪个 harness`。
  - 路由：`ultrawork` 关键词、角色切换后 system prompt 是否切换。
  - 工具 gating：让 GPT 模型直呼 `apply_patch` 与 `edit/write`，检查“可见 schema + 执行门禁”是否同时生效。
  - fallback：注入可重试错误（限流/404/5xx），核对 fallback 链顺序与重试语义。
  - maxSteps：小 maxSteps 下核对 `MAX_STEPS_PROMPT` 是否以 assistant 角色进入历史。
  - 权限：工作区外路径写、连续三次同命令（doom loop）分别触发 ask/deny 的边界。
  - 指令层级：system 与 user/tool-output 冲突时，两侧优先级是否一致（instruction hierarchy 探针）。
- 判定：每类探针**配对**统计，双侧共享同一探针集合；差异先定位到具体段落再修，修完回归。

### L2 工具调用契约测试（有 LLM，中成本）

目的：确认“工具面”在功能语义上等价，而不只是 JSON 文本相似。

- **BFCL 风格的 schema 一致性**：用同一函数调用样例集跑两个 harness 的 `read/edit/write/bash/apply_patch/task/subagent`，按“工具名、参数名、参数值”三级判对。
- **τ-bench / τ²-bench 小型子集**：重点测多步调用、权限/确认、失败恢复与政策遵守；τ² 的双控环境正好覆盖“确认、权限、fallback”这三类本插件最常出的问题。
- **环境状态判据**：工具结果不看文本，看工作目录/文件内容/进程状态是否一致；用 false-success 分析抓“宣称完成但状态不对”。

### L3 端到端行为等价（当前 HumanEval/MBPP/SWE 的升级版）

- **任务集**：
  - 编码：HumanEval、MBPP 扩充到 **≥30–50 题**（现 5 题只够演示，不够推断）。
  - 仓库级：SWE-bench Verified/Lite/Mini 抽样，统一 patch-only 判分（两侧只交 patch，用同一测试 harness 跑）。
  - 终端任务：Terminal-Bench 2.0 少量任务（它是目前最接近“同任务多 harness 对比”的公开基准；每任务独立容器、最终状态判分、不看命令轨迹）。
- **每任务重复**：agentic 任务建议 **r=3–5** 次独立运行；temperature=0 不等于确定性（文献报告其标准差仍 >1.5pp）。
- **判分**：pass@1（配对方差）+ 最终产物逐字节比较（如 patch/diff）+ 失败题必须同题同败才算一致。
- **轨迹度量**（只定位，不计分）：
  - 工具名/参数规范化后做 Levenshtein / Needleman-Wunsch 序列比对；
  - 找 **divergence point**（首次分歧的工具调用或参数），并记录分歧后的状态差异；
  - 归一化 token 重叠（Jaccard/ROUGE）只做第一层筛选——它语义盲，不能单独作为等价证据。

### L4 性能/缓存对比（当前 metrics 的升级版）

- 指标（已有口径基础上补百分位与冷热分离）：
  - token：input / cacheRead / cacheWrite / output / reasoning；命中率分母固定为 `cacheRead / (input + cacheRead)`，并注明 DeepSeek 的 `hit/(hit+miss)` 语义等价。
  - 延迟：TTFT、step 时长、总 wall time，报告 min/avg/p50/p95/p99；**冷启动请求单独一行**。
  - 工具：逐工具 count/min/avg/p50/p95/max/errors；至少覆盖 bash、write、edit、read。
- **harness 开销隔离**：
  - 固定 1-token 输出请求测 API 侧基线；
  - 两系统各注册一个 no-op 工具，测框架调度/序列化开销；
  - 相同 prompt 序列先各 warm-up 一次再正式测量；
  - A/B/A/B 交替运行，排除限流/网络时间漂移。
- 解释规则：工具耗时差异必须区分“行为差异”（一侧多一次 read）与“harness 固定开销”（dsh persistent PTY 5–7s）；行为链不同构时不做逐工具均值直接比较，或先按轨迹层对齐。

### L5 回归护栏（每次改完 prompt/tool 都跑）

- 上述 L1 定制探针作为 CI 冒烟集；
- A/A 基线：opencode-omo 用不同 seed 跑同一任务集两次，记录差异的分布——这就是本仓库的噪声地板；
- 任何“修好一个对齐问题”都要附上：出问题的轨迹 → 修复 → 新轨迹的分歧点是否消失。

## 3. 统计协议

### 3.1 二元结果（pass/fail）

同一任务两系统各 r 次运行，得到配对四格（A对B错 = b，A错B对 = c）：

- 小样本：精确二项检验，`B ~ Binomial(b+c, 0.5)`；或用 permutation（在任务对内交换 A/B 标签）。
- 中等样本：McNemar，`χ² = (b−c)²/(b+c)`；三个以上系统/变体用 Cochran Q。
- 报告 95% bootstrap CI（B≥10,000，percentile/BCa），必须**按任务成对重采样**。

### 3.2 连续指标（延迟、工具次数、轨迹距离）

- 先看分布；近似正态用 paired t + Cohen's `d_z`；偏态/小样本用 Wilcoxon signed-rank，报告 Hodges-Lehmann 中位差。
- 一律报告效应量与 CI，不只给 p 值。

### 3.3 等价性（我们真正的问题）

“无显著差异”不是等价。用 **TOST**：

- 预声明等价边界：建议 pass@1 边界 `δ_E = ±5pp`（agentic 任务），连续指标 `±0.5σ` 或 `±10% 中位数`。
- 两个单侧检验都拒绝 ⇔ 90% CI 完全落在 `(−δ_E, +δ_E)` 内 ⇒ 宣告等价。
- **A/A 先行**：若同一 harness 自比的差异 SD 已经超过 `δ_E`，说明该指标噪声太大，要么降噪、要么不能在该指标上声明等价。

### 3.4 样本量规划（McNemar 配对设计先验）

设 `δ` 为目标差异、`ψ = p01 + p10` 为不一致比例、α=0.05、power=0.8：

- 最乐观 `ψ≈δ`：检测 10pp 约 **80 题**，5pp 约 **150 题**。
- 保守 `ψ≈0.3`：检测 10pp 约 **230 题**，5pp 约 **900 题**。
- 对比独立两样本比例通常要多 40–60% 任务，所以共享任务的配对设计是我们的默认。
- 实际 n 由本仓库 A/A 或 pilot 数据估计 `ψ` 后决定；**当前 n=5 只能算 smoke，不能下统计结论**。

## 4. 落地到现有 bench 脚本

现有资产（保留）：
- `fetch-benches.sh` / `setup-homes.sh`：数据与隔离 home。
- `run_bench.mjs`：L3 编码任务，已独立 workdir。
- `bench_metrics.mjs` + `eval_perf.mjs` / `eval_swe_perf.mjs`：L4 已实现基础版。
- `eval_bench.mjs`：pass@1 + Jaccard + 工具序列（需替换 Jaccard 的“证据”地位，降为辅助）。

已落地（2026-08-16）：
1. `probes/omo-probes.json` + `run_probes.mjs` / `eval_probes.mjs`：L1 定制探针（身份/格式/工具/持久 shell/多步）。
2. `eval_stats.mjs`：McNemar / 精确二项 / paired bootstrap CI / paired t / Wilcoxon / Hodges-Lehmann / TOST。
3. `trace_align.mjs`：L3 轨迹规范化、Levenshtein 距离、divergence point、逐工具计数差。
4. `run_exp.mjs` / `eval_exp.mjs`：L3 多任务 × 多重复、A/B/A/B 交替、独立 workdir，并自动纳入 L4 性能配对比较。
5. `run_aa.mjs` / `eval_aa.mjs`：A/A 噪声地板。
6. `run_swe_sample.mjs`：新增独立 venv + FAIL_TO_PASS 复验，L3 SWE 判分不再只比 diff。
7. `bench_common.mbppEntryPoint()` + 判题脚本修复：消除 MBPP `Function name: undefined` 伪影（这是之前 MBPP 行为分歧的根因，修正后 A/B 与 A/A 均回到零差异）。

待补：
- `tool_schema_diff.mjs`（L0 schema 对齐报告）。
- L4 no-op 工具基线、冷/热请求分离报告、p95/p99 百分位。
- MBPP 修正后扩到 ≥20 题 × 3 轮，得到足以支撑“等价”声明的样本量。

## 5. 结论声明分级

- **只能演示**：n=5、r=1 的通过率（当前）。
- **统计有效的行为对比**：n≥30–50 且 r≥3，配 McNemar/bootstrap CI 与 A/A。
- **等价性声明**：TOST 通过 + 预注册边界 + A/A 支持。
- **性能对比**：冷热分离 + 同 prompt + 交替顺序 + 百分位；否则只报告“原始遥测”，不叫基准。

## 6. 主要参考文献

- Chen et al., Evaluating LLMs Trained on Code (pass@k)：https://arxiv.org/abs/2107.03374
- McNemar (1947)：https://doi.org/10.1007/BF02295996 ；Cochran (1950)：https://doi.org/10.2307/2331942
- Dror et al., Hitchhiker's Guide to Testing Statistical Significance in NLP (ACL 2018)：https://aclanthology.org/P18-1128/
- Schuirmann, TOST (1987)：https://doi.org/10.1007/BF01068419 ；Lakens, Equivalence tests (2017)：https://doi.org/10.1177/1948550617697177
- Quantifying Variance in Evaluation Benchmarks (2024)：https://arxiv.org/abs/2406.10229
- Towards Reproducible LLM Evaluation (2024)：https://arxiv.org/abs/2410.03492
- On Randomness in Agentic Evals (2026, preprint)：https://arxiv.org/abs/2602.07150
- SWE-bench：https://arxiv.org/abs/2310.06770 ；SWE-bench Verified：https://openai.com/index/introducing-swe-bench-verified/
- Terminal-Bench 2.0 (2026, preprint)：https://arxiv.org/abs/2601.11868 ；https://www.tbench.ai/
- τ-bench：https://arxiv.org/abs/2406.12045 ；τ²-bench：https://arxiv.org/abs/2506.07982
- OnlyCodes 工具面消融 (2026, preprint)：https://arxiv.org/abs/2607.10569
- IFEval：https://arxiv.org/abs/2311.07911 ；FollowBench：https://arxiv.org/abs/2310.20410
- BFCL/Gorilla leaderboard：https://gorilla.cs.berkeley.edu/leaderboard
- Instruction hierarchy：https://arxiv.org/abs/2404.13208 ；RULER：https://arxiv.org/abs/2404.06654
- MT-Bench / LLM-as-a-Judge：https://arxiv.org/abs/2306.05685 ；position bias：https://arxiv.org/abs/2406.07791
- vLLM 指标定义（TTFT/ITL/cache）：https://docs.vllm.ai/en/latest/usage/metrics/ ；DeepSeek cache：https://api-docs.deepseek.com/guides/kv_cache
- Artificial Analysis methodology：https://artificialanalysis.ai/methodology ；LLMPerf：https://github.com/ray-project/llmperf

> 注：若干 2026 年编号（2601/2602/2606/2607/2608）来自调研 subagent 的检索结果，为预印本且本仓库未逐一下载全文；在正式报告引用前应复核标题与 PDF。
