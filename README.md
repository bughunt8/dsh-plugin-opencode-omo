<p align="center">
  <img src="https://raw.githubusercontent.com/royenheart/dsh-plugin-opencode-omo/main/assets/banner.png" width="100%" alt="dsh-plugin-opencode-omo" />
</p>

# @royenheart/dsh-plugin-opencode-omo

Maintained fork: [bughunt8/dsh-plugin-opencode-omo](https://github.com/bughunt8/dsh-plugin-opencode-omo).
Original project: [royenheart/dsh-plugin-opencode-omo](https://github.com/royenheart/dsh-plugin-opencode-omo).
The upstream package name is retained for compatibility and attribution.

A DeepSeek Harness plugin that adds an `opencode-omo` agent preset (mode) to the web profile. The mode replicates the behavior of **opencode** + the **omo** plugin ([oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)), scoped to this mode only — other presets (`standard`/…) keep the default dsh loop, sandboxed fs, and no omo hooks.

## What the mode provides

- **opencode + omo system prompt** — the real opencode `default.txt` persona (tone, style, proactiveness, conventions, code style, task guidance) + omo's Sisyphus orchestrator identity, declared as the **complete** system prompt: the dsh harness identity and runtime-context snapshot are suppressed for this mode. The loop shim additionally prepends opencode's **live environment block** (exact model id, working dir, workspace root, git, platform, date, recomputed every step).
- **omo role picker in the composer** — in dsh's existing `conversation.input.left` tool-row slot (after the access/plan chips): `sisyphus`, `hephaestus` (Deep Agent), `prometheus` (Plan Builder), `atlas` (Plan Executor), `sisyphus-junior`, `athena`/`athena-junior`/`council-member`, `metis`, `momus`, `oracle`, `librarian`, `explore`, `multimodal-looker`. Selecting a role swaps the session's complete system prompt and applies that role's configured model.
- **Global "Role Settings"** in the dsh settings panel (`settings.section`): per-role primary model dropdown (follow current / fixed) under a centered "Primary model" label; a dsh-style circle "+" button opens a fallback model list below the role box (repeatable additions, cancel/close adds nothing), persisted in `opencode-omo-roles` settings. On request failure the loop shim advances through the role's fallback chain before the harness retry policy runs.
- **opencode toolchain (complete)** — persistent `bash`, `read`/`write`/`edit`/`read_image`, `apply_patch`, `glob`/`grep`, `todo_write`, `skill`, `web_fetch`/`web_search`, `lsp`, `exit_plan_mode` (plan), `ask_user_question`. `tool-surface.mjs` overwrites the model-visible descriptions/parameters with opencode's `tool/*.txt` text and shims `read`/`edit`/`write`/`web_search` to opencode's parameter names (`web_search.query` → dsh `queries`).
- **omo `task()` surface** — `task-shim.mjs` registers the omo-style `task(category/subagent_type/load_skills/run_in_background/task_id)` invocation, mapping it onto dsh named subagents + generic delegation.
- **omo multi-role subagents** — `oracle` (read-only advisor), `librarian` (external docs/code search), `explore` (codebase grep), `metis` (pre-planning), `momus` (plan reviewer), `multimodal-looker` (media), plus generic `subagent`/`subagent_fork` + `workflow`/`ralph`.
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

### Full stack through the parent repository

[**dsh-env**](https://github.com/bughunt8/dsh-env) is the parent repository and main
clean-setup entry point for Harness + OMO + LSP Actions + CodeGraph. Follow its
setup guide to install the tested component artifacts and required tools together.
Do not run this plugin's standalone installer against a dsh-env managed release.
The parent repository currently requires GitHub access; component forks remain
independently usable.

### Independent installation

OMO does not require dsh-env, LSP Actions, or CodeGraph. The supported baseline is
**Node.js 24, Python 3.10+, npm, and stock DeepSeek Harness 0.1.2-rc.1** on Linux.
Do not substitute the floating alpha tag or mix older Harness peer packages.

From this existing source directory:

```sh
npm ci --ignore-scripts
npm run build
python3 install.py install --profile web --home "$HOME/.dsh"
```

The installer initializes a missing web profile and registers OMO and its preset.
It does not install Harness, clone any repository, replace a launcher, or copy
credentials. Install the stock runtime separately if it is not already available:

```sh
npm install --prefix "$HOME/.local/share/dsh-runtime" @deepseek-ai/dsh@0.1.2-rc.1
DSH_HOME="$HOME/.dsh" "$HOME/.local/share/dsh-runtime/node_modules/.bin/dsh" web
```

Restart Harness and select **opencode-omo**. Keep the source directory in place:
the source installer deliberately links to it. Use the packaged path below when
the installed runtime must be independent of a development checkout.

### Independent built-package installation

Maintainers produce the artifact with `npm run build && npm pack --ignore-scripts`.
Install that exact tarball beside a stock Harness runtime, then publish its preset:

```sh
npm install --prefix "$HOME/.local/share/dsh-runtime" --ignore-scripts /path/to/royenheart-dsh-plugin-opencode-omo-0.2.0.tgz
python3 "$HOME/.local/share/dsh-runtime/node_modules/@royenheart/dsh-plugin-opencode-omo/install.py" install --home "$HOME/.dsh"
```

The built artifact carries its bundles, preset, public declarations and attribution.
It does not require the original checkout or development toolchain. This repository
is not published to the npm registry; do not assume `npm install` by package name
will retrieve this fork.

### Update and remove

For source installs, update files in the same checkout and rerun the installer.
For packaged installs, replace the tarball in the same runtime prefix and rerun
its installer. Repeated installation does not duplicate bundle entries.

```sh
python3 install.py uninstall --profile web --home "$HOME/.dsh"
```

For a packaged install, run `uninstall` using that package's installed `install.py`
before removing the npm package. Removal preserves unrelated profile configuration,
custom preset files and foreign symlinks. Moving an installation to a different
source path requires uninstalling from the original path first; conflicting
ownership is reported instead of overwritten.

### Companion tools and troubleshooting

- [LSP Actions](https://github.com/bughunt8/dsh-lsp-actions) supplies real diagnostics,
  rename and formatting. Configure its language server as documented there.
  Stock Harness may omit native navigation packages; this does not block OMO.
  Installing a TypeScript executable alone does not add missing native packages.
- [CodeGraph](https://github.com/bughunt8/dsh-plugin-codegraph) supplies code-graph
  queries with its separately provisioned CLI and workspace index.
- OMO advertises only actual installed tools, not fake diagnostics/rename results.
  Read-only specialist roles cannot call companion mutation tools.
- A **managed directory symlink** error means another installer owns the profile.
  Use dsh-env to update its releases instead of modifying them in place.
- A **foreign path/dependency** error leaves the conflicting entry untouched.
  Check which install owns it; do not delete user files to bypass the check.
- A dependency mismatch should be fixed with the committed npm lockfile, not
  `--force`, `--legacy-peer-deps`, or links to an arbitrary global Harness.
- Configure model credentials through Harness. Never put keys in repository files
  or attach unredacted settings, credential files, or startup tokens to issues.

## Development and project support

Source lives in `src/`, preset/runtime modules in `presets/`, build tooling in
`scripts/`, and tests in `tests/`. `lib/` is generated and included only in packages.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm run test:install
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md),
[CHANGELOG.md](CHANGELOG.md), and [NOTICE.md](NOTICE.md). Changes are not released
merely because they exist locally; release artifacts must identify the tested
revision and pass both standalone and parent integration checks.

## Required dsh-side changes

**This release ships no dsh patches.** Official 0.1.2-alpha.2 has no `PreStepDecision.assistantPrefill`; the plugin no longer carries `patches/0001-agent-pre-step-assistant-prefill.patch` which is:

maxSteps still fires. The ceiling text is opencode's verbatim `MAX_STEPS_PROMPT`, injected as a **system-prompt section** on the step that hits the cap. That is the supported 0.1.2 path (`ctx.systemPrompt.section`), not a silent drop.

### Behavioral gaps after dropping the assistantPrefill patch

These are intentional and will not match stock opencode until [discussion #2407](https://github.com/deepseek-ai/deepseek-harness/discussions/2407) (or an equivalent) lands upstream:

| Surface | opencode / patched-harness | This plugin on stock 0.1.2 |
|---|---|---|
| Role of `MAX_STEPS_PROMPT` | Assistant-role continuation at the end of the request | System-prompt prefix for that step |
| Session transcript / stats / compaction | Request-only (header), not a session message | Also not a session message (system section is reassembled) |
| How strictly models stop / wrap up | Tuned for an assistant tail | May treat a system reminder more weakly or more strongly |
| Token placement | Extra assistant tokens on that request | Extra system tokens on that request |
| Reconstructable-requests | Logged on `request/header` | Rebuilt from the live prompt assembly |

The host still scans `@deepseek-ai/dsh-agent-loop` for a compiled `assistantPrefill` marker. If you run a **local** harness that still has the old seam, the driver uses the assistant tail automatically. The `/roles` payload's `compat.warnings` and a one-shot browser Toast describe the system-prompt path; they no longer tell you to apply a patch from this repo.

Provider-visible `format`/`toolChoice` remains an unpatched proposal; omo's regular path does not use it.

Everything else runs on unmodified dsh seams: the preset is published through `$DSH_HOME/.agent-presets` and the composer picker occupies the existing `conversation.input.left` slot.

## Bench experiments (equivalence validation)

Runners and reproduction notes live in [`tests/benches/`](tests/benches/README.md); reports are written to `docs/exps/`. The scientific methodology (paired design, McNemar/bootstrap/TOST, A/A noise floor, trace alignment, cache and latency protocols) is documented in [`docs/exps/2026-08-16-scientific-bench-methodology.md`](docs/exps/2026-08-16-scientific-bench-methodology.md). Design highlights:

- Run an isolated-port dsh (`opencode-omo` mode, isolated `$DSH_HOME`) and the machine's installed opencode + oh-my-openagent (isolated `XDG_CONFIG_HOME`).
- Both use `deepseek-official/deepseek-v4-pro` (dpsk v4 pro); the API key comes from the `DEEPSEEK_API_KEY` environment variable. Scripts hardcode no machine paths or secrets.
- Tiered benches: L1 HumanEval, L2 MBPP, L3 SWE-bench-verified-mini (sampled), comparing pass@1, CoT/reasoning exposure, tool-call chains (read/edit/write/bash/test/subagents), and final patches/answers.
- Performance: `bench_metrics.mjs` normalizes token usage (including `cacheRead`) and tool timestamps on both sides; `eval_perf.mjs` / `eval_swe_perf.mjs` produce cache hit rate, TTFT, step duration, and per-tool timing offline (see report §5).
- **MBPP fix**: MBPP rows have no `entry_point`; the scripts infer the function name from the first `assert fn(...)` or the reference `def fn`. The old implementation hardcoded `Function name: undefined`, which was the root cause of MBPP behavioral divergence (see report §0 and §6.4).
- Raw bench data is downloaded to `tests/benches/.data/` and is **not versioned**; `fetch-benches.sh` reproduces the downloads and `setup-homes.sh` reproduces both isolated homes.

### Latest results (dpsk v4 pro; L1 30×3, corrected L2 5×2, legacy L3 sample)

| level | dsh pass@1 | opencode+omo pass@1 | per-item agreement |
|---|---|---|---|
| HumanEval (30 tasks × 3 repeats) | 1.00 | 1.00 | 1.00 |
| MBPP (corrected entry_point, 5 tasks × 2 repeats) | 1.00 | 1.00 | 1.00 |
| SWE-bench-verified-mini sample (`sphinx-doc__sphinx-10323`) | same patch | same patch | byte-identical git diff |

Full report: `docs/exps/2026-08-15-opencode-omo-equivalence-bench.md`; raw transcripts are under `tests/benches/.runs/`.

## Alignment status (audited against reference/opencode + reference/oh-my-openagent)

- **Aligned**: opencode default persona (complete system prompt + live env block whose provider/model now follow the same per-step route as the actual request — session live model selection or the role primary/fallback — so prompt and request cannot split; workspace root now derived as the git root); opencode tool families + gpt apply_patch/edit-write tool gating enforced on BOTH the model-visible schema and execution (`tools/pre-execute` deny mirror); opencode maxSteps + verbatim MAX_STEPS_PROMPT; verbatim opencode plan.txt / plan-mode.txt with dynamic `${planInfo}` and the plan→build BUILD_SWITCH reminder; omo role catalog/display names; sisyphus/hephaestus/atlas/sisyphus-junior + specialist subagents; comment-checker/hashline/rules-injector hooks; generated Sisyphus routing sections; extracted omo Sisyphus model-family templates (GPT-5.5/GPT-5.4/claude-opus-4-7/claude-opus-4-8/claude-fable-5/gemini/kimi-k3/kimi-k2-7/kimi-k2-6/glm-5-2, with the dynamic Sisyphus fallback for unknown families) plus hephaestus GPT variants, all 8 atlas variants, and specialist model variants (oracle/metis/momus); omo-default per-role PRIMARY model resolution (provider-scope ordered) and fallback chains that start AFTER the primary; omo role sampling defaults (sisyphus/hephaestus GPT effort medium, atlas temperature 0.1); omo-style retryable-error gating before fallback advance; reasoning-effort selectors in role settings; ultrawork keyword override; `/start-work`, `/remove-ai-slops`, `/refactor`, `/stop-continuation`, `/handoff`, `/hyperplan`, `/team-mode` commands; composer role picker + global per-role model/fallback settings; omo skills published as `user-dsh` so the third-party skills-manager can manage them. The omo rules-injector text is now folded into the complete system prompt (`driver.mjs` + `rules.mjs`) instead of being dropped by `suppressRuntimeContext()`; approved plans are persisted at `.opencode/plans/<created>-<session>.md`; specialist subagent personas now load the extracted reference prompt files (oracle/librarian/explore/metis/momus/multimodal-looker).
- **MCP**: separate plugin [`dsh-plugin-mcp-support`](../dsh-plugin-mcp-support) mounts native `@deepseek-ai/dsh-mcp-client` servers from its bundle-row config or the persisted `mcp-support` settings namespace.
- **Structured output**: separate plugin [`dsh-plugin-structured-output`](../dsh-plugin-structured-output) provides opencode-style `/json-schema` + `StructuredOutput` validation on native seams (no dsh-side format field). Its visibility is opt-in per preset via Settings → 结构化输出工具 (Structured output); no mode is enabled by default.
- **Partial**: extracted family templates keep dynamic sections filled by dsh-native data rather than omo's builder output; structured output is tool-enforced rather than `tool_choice: required`; hooks are regex/simplified ports; AGENTS.md injection is dsh-native; child subagents inherit the session model because dsh child headers/descriptors do not carry the subagent role id (primary-role sampling defaults ARE applied).
- **No dsh-side patch in this repo.** maxSteps uses a system-prompt section on stock 0.1.2 (see “Behavioral gaps after dropping the assistantPrefill patch” above). `format`/`toolChoice` remains a proposal; the standalone structured-output plugin covers the common route.

## Remaining gaps

1. **maxSteps role (accepted, no local patch)**: on stock 0.1.2, `MAX_STEPS_PROMPT` is a system-prompt section, not an assistant-role request tail. Same text and trigger; models may treat the role differently than opencode. Tracked upstream as [discussion #2407](https://github.com/deepseek-ai/deepseek-harness/discussions/2407).
2. **dsh-side (proposal, medium)**: `GenerateOptions.format` / `toolChoice`. omo's regular path does not use them; the standalone structured-output plugin covers the common route.
3. Child subagent per-role sampling cannot reliably resolve the role id (dsh child headers/descriptors do not carry it); primary-role sampling defaults ARE applied and children inherit the session model.
4. Plan files: dsh itself does not persist them; the plugin writes `.opencode/plans/*` after `exit_plan_mode` approval. A first-class plan-file seam remains an optional improvement.
5. team-mode TUI, comment-checker CLI, and hashline diff enhancer remain non-LLM/editing experience differences.
