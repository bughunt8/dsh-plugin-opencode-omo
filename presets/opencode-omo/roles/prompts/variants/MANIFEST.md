# Prompt variant extraction manifest

Sisyphus family overlays in this directory (and `../family/`) and the
atlas / hephaestus / oracle / metis / momus rows below were re-extracted
from oh-my-openagent `v5.0.0-beta.31` (`62ed795`). Librarian / explore /
multimodal-looker still come from the earlier pin `14083b89`.

Harness-only adaptations (not present upstream): `interactive_bash` → persistent
`bash`; Atlas `codegraph_*` REQUIRED-TOOLS lines → “this harness has no
Codegraph tools”. Dynamic `${...}` / `{{ ... }}` / `{CATEGORY_SECTION}`
placeholders stay in the extracted files and are rendered by `driver.mjs`.

All target paths are relative to `presets/opencode-omo/roles/prompts/variants/`.

## sisyphus/kimi-k2-6.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/sisyphus/kimi-k2-6.ts`
- Extracted constant/builder: largest const template `executionLoopBlock`
- Line count (wc -l): 113
- Caveats: No single MAIN template constant in the file; used the largest `const X = `...`` template (matching the existing `family/gpt-5-4.md` extraction convention). Other block constants are not included in this file.

## sisyphus/kimi-k2-7.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/sisyphus/kimi-k2-7.ts`
- Extracted constant/builder: largest const template `executionBlock`
- Line count (wc -l): 30
- Caveats: No single MAIN template constant in the file; used the largest `const X = `...`` template (matching the existing `family/kimi-k3.md` extraction convention). Other block constants are not included in this file.

## sisyphus/claude-fable-5.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/sisyphus/claude-fable-5.ts`
- Extracted constant/builder: `return `...`;` template literal of `buildClaudeFable5SisyphusPrompt` (full built body)
- Line count (wc -l): 373
- Caveats: File has no const template; extracted the single return template literal, which is the full built variant body with dynamic `${...}` placeholders intact.

## sisyphus/claude-opus-4-8.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/sisyphus/claude-opus-4-8.ts`
- Extracted constant/builder: `return `...`;` template literal of `buildClaudeOpus48SisyphusPrompt` (full built body)
- Line count (wc -l): 373
- Caveats: File has no const template; extracted the single return template literal, which is the full built variant body with dynamic `${...}` placeholders intact.

## hephaestus/gpt.md

- Reference source: oh-my-openagent `v5.0.0-beta.31` `packages/omo-opencode/src/agents/hephaestus/gpt.ts`
- Extracted constant/builder: main `return `...`;` template literal of `buildHephaestusPrompt`
- Line count (wc -l): 241
- Caveats: No single template constant. Extracted the main return-template body. `${oracleSection ? ... : ""}` was kept as `${oracleSection}`. `${todoDiscipline}` and other dynamic `${...}` placeholders stay and are rendered by `familySection`.

## hephaestus/gpt-5-4.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/hephaestus/gpt-5-4.ts`
- Extracted constant/builder: concatenation of block consts `identityBlock`, `intentBlock`, `exploreBlock`, `constraintsBlock`, `executionBlock`, `trackingBlock`, `progressBlock`, `delegationBlock`, `communicationBlock` in builder return order
- Line count (wc -l): 227
- Caveats: No single template constant. Expanded the builder return (`identityBlock` … `communicationBlock`) in order. `${hasOracle ? ... : ""}` was kept as `${oracleSection}`. `${todoDiscipline}` and other dynamic `${...}` placeholders stay and are rendered by `familySection`.

## hephaestus/gpt-5-5.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/hephaestus/gpt-5-5.ts`
- Extracted constant/builder: `const HEPHAESTUS_GPT_5_5_TEMPLATE`
- Line count (wc -l): 210
- Caveats: None

## hephaestus/gpt-5-6.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts`
- Extracted constant/builder: `const HEPHAESTUS_GPT_5_6_TEMPLATE`
- Line count (wc -l): 148
- Caveats: None

## atlas/default.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/default.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 496
- Caveats: None

## atlas/gemini.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/gemini.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 526
- Caveats: None

## atlas/glm.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/glm.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 403
- Caveats: None

## atlas/gpt.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/gpt.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 461
- Caveats: None

## atlas/kimi-k2-7.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/kimi-k2-7.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 326
- Caveats: None

## atlas/kimi-k3.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/kimi-k3.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 326
- Caveats: None

## atlas/kimi.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/kimi.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 478
- Caveats: None

## atlas/opus-4-7.md

- Reference source: `reference/oh-my-openagent/packages/prompts-core/prompts/atlas/opus-4-7.md`
- Extracted constant/builder: verbatim copy
- Line count (wc -l): 494
- Caveats: None

## specialists/oracle-default.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/oracle.ts`
- Extracted constant/builder: `const ORACLE_DEFAULT_PROMPT`
- Line count (wc -l): 110
- Caveats: None

## specialists/oracle-gpt.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/oracle.ts`
- Extracted constant/builder: `const ORACLE_GPT_PROMPT`
- Line count (wc -l): 79
- Caveats: None

## specialists/oracle-gpt-5-5.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/oracle.ts`
- Extracted constant/builder: `const ORACLE_GPT_5_5_PROMPT`
- Line count (wc -l): 163
- Caveats: None

## specialists/metis-default.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/metis.ts`
- Extracted constant/builder: `const METIS_SYSTEM_PROMPT`
- Line count (wc -l): 271
- Caveats: Contains `${buildAntiDuplicationSection()}` placeholder, preserved as-is.

## specialists/metis-kimi-k2-7.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/metis.ts`
- Extracted constant/builder: `const METIS_K2_7_SYSTEM_PROMPT`
- Line count (wc -l): 95
- Caveats: Contains `${buildAntiDuplicationSection()}` placeholder, preserved as-is.

## specialists/momus-default.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/momus.ts`
- Extracted constant/builder: `const MOMUS_DEFAULT_PROMPT`
- Line count (wc -l): 176
- Caveats: None

## specialists/momus-gpt.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/momus.ts`
- Extracted constant/builder: `const MOMUS_GPT_PROMPT`
- Line count (wc -l): 75
- Caveats: None

## specialists/momus-gpt-5-6.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/momus-gpt-5-6.ts`
- Extracted constant/builder: `const MOMUS_GPT_5_6_PROMPT`
- Line count (wc -l): 52
- Caveats: None

## specialists/librarian.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/librarian.ts`
- Extracted constant/builder: `prompt: `...`` template literal in `createLibrarianAgent`
- Line count (wc -l): 277
- Caveats: Single prompt used for all models. Preserves dynamic `${new Date().getFullYear()}` / `${new Date().getFullYear() - 1}` placeholders and the literal `${TMPDIR:-/tmp}` shell expansions.

## specialists/explore.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/explore.ts`
- Extracted constant/builder: `prompt: `...`` template literal in `createExploreAgent`
- Line count (wc -l): 77
- Caveats: Single prompt used for all models; no dynamic `${...}` placeholders.

## specialists/multimodal-looker.md

- Reference source: `reference/oh-my-openagent/packages/omo-opencode/src/agents/multimodal-looker.ts`
- Extracted constant/builder: `prompt: `...`` template literal in `createMultimodalLookerAgent`
- Line count (wc -l): 36
- Caveats: Single prompt used for all models; no dynamic `${...}` placeholders.
