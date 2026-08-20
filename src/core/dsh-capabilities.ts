/**
 * Detection of dsh-side seams the plugin can use, plus the degradation path
 * taken when the harness predates the seam. dsh is still under development, so
 * a profile can easily run a build that lacks `patches/0001-…-assistant-prefill`;
 * the plugin must keep working and must tell the user what degraded.
 *
 * The seam has no runtime flag (the patch is structural), so the detector
 * resolves the installed `@deepseek-ai/dsh-agent-loop` entry and checks for
 * the compiled `decision.assistantPrefill` marker. It is read once per process.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Public compatibility snapshot served to the browser and consumed by the preset driver. */
export interface DshCompat {
  /** dsh records `PreStepDecision.assistantPrefill` (patched harness). */
  readonly assistantPrefill: boolean
  /** Max-steps strategy chosen for this harness. */
  readonly maxStepsMode: 'assistant-prefill' | 'system-prompt-section' | 'disabled'
  /** User-facing degradation notices (empty when fully supported). */
  readonly warnings: readonly string[]
  /** True when the detection itself failed (e.g. agent-loop package unresolvable). */
  readonly detectionFailed: boolean
}

export const ASSISTANT_PREFILL_WARNING = '当前 dsh 构建缺少 agent/pre-step assistantPrefill 补丁：maxSteps 触顶提示已降级为系统提示词注入（文本相同但位于 system prompt，非 assistant 角色续写）。请应用 patches/0001-agent-pre-step-assistant-prefill.patch 并重建 harness。'
export const DETECTION_FAILED_WARNING = '无法确认 dsh 是否支持 assistantPrefill（@deepseek-ai/dsh-agent-loop 解析失败）：maxSteps 触顶提示使用系统提示词注入降级。'

let cached: DshCompat | undefined

/** Read the installed agent-loop entry text for the structural marker. */
function agentLoopEntryText(): { ok: true; text: string } | { ok: false } {
  try {
    const entry = require.resolve('@deepseek-ai/dsh-agent-loop')
    return { ok: true, text: readFileSync(entry, 'utf8') }
  } catch {
    return { ok: false }
  }
}

/** Detect (and cache) the dsh capability snapshot for this process. */
export function detectDshCompat(): DshCompat {
  cached ??= computeDshCompat()
  return cached
}

function computeDshCompat(): DshCompat {
  const resolved = agentLoopEntryText()
  if (!resolved.ok) {
    return {
      assistantPrefill: false,
      maxStepsMode: 'system-prompt-section',
      warnings: [DETECTION_FAILED_WARNING],
      detectionFailed: true,
    }
  }
  const supported = resolved.text.includes('assistantPrefill')
  return {
    assistantPrefill: supported,
    maxStepsMode: supported ? 'assistant-prefill' : 'system-prompt-section',
    warnings: supported ? [] : [ASSISTANT_PREFILL_WARNING],
    detectionFailed: false,
  }
}

/** Exported for tests that want a fresh computation per harness build. */
export function _resetDshCompatCache(): void {
  cached = undefined
}
