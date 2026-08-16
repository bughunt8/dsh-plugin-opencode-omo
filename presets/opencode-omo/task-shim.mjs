// opencode-omo `task` shim: maps omo's model-facing
// `task(category=..., subagent_type=..., load_skills=[...],
// run_in_background=..., task_id=..., description=..., prompt=...)` surface onto
// dsh's native subagent services.
//
// Routing:
//   task_id        -> continuable follow-up (`ctx.subagents.followup`)
//   subagent_type  -> one-shot start with the SAME persona + toolFilter used by
//                     the matching named row in agent.cordis.yml
//   category       -> generic subagent with a small category persona note
//   neither        -> generic subagent
//
// `load_skills` has no dsh equivalent; the shim prepends a
// `<loaded_skills>` instruction block to the child prompt instead.

import { readFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'opencode-omo-task-shim'
export const inject = ['tools', 'subagents', 'jobs']

/** The subagent provider used by every named row and generic spawn in this preset. */
const PROVIDER = 'spawn'

/** Known named rows from agent.cordis.yml, in the order they appear there. */
export const KNOWN_SUBAGENT_TYPES = [
  'oracle',
  'librarian',
  'explore',
  'metis',
  'momus',
  'multimodal-looker',
  'sisyphus',
  'hephaestus',
  'atlas',
  'sisyphus-junior',
]

/** Common omo task categories this shim maps to a generic persona note. */
export const KNOWN_CATEGORIES = [
  'visual-engineering',
  'deep',
  'ultrabrain',
  'quick',
  'writing',
  'git',
]

/**
 * toolFilters copied verbatim from agent.cordis.yml.
 * The read-only specialist rows deny every recursion/delegation name; the
 * primary-agent rows deny the whole named roster plus workflow/ralph;
 * multimodal-looker keeps only read/read_image.
 */
const DENY_SPECIALISTS = [
  'write',
  'edit',
  'task',
  'subagent',
  'subagent_fork',
  'oracle',
  'librarian',
  'explore',
  'metis',
  'momus',
  'multimodal-looker',
  'workflow',
  'ralph',
]

const DENY_PRIMARY = [
  'task',
  'subagent',
  'subagent_fork',
  'oracle',
  'librarian',
  'explore',
  'metis',
  'momus',
  'multimodal-looker',
  'sisyphus',
  'hephaestus',
  'atlas',
  'sisyphus-junior',
  'workflow',
  'ralph',
]

/**
 * Named-row mapping: persona file path (relative to this module) and the exact
 * toolFilter that row configures in agent.cordis.yml.
 */
export const SUBAGENT_TYPE_DEFS = {
  oracle: {
    persona: 'roles/prompts/variants/specialists/oracle-default.md',
    toolFilter: { deny: DENY_SPECIALISTS },
  },
  librarian: {
    persona: 'roles/prompts/variants/rendered/librarian.md',
    toolFilter: { deny: DENY_SPECIALISTS },
  },
  explore: {
    persona: 'roles/prompts/variants/specialists/explore.md',
    toolFilter: { deny: DENY_SPECIALISTS },
  },
  metis: {
    persona: 'roles/prompts/variants/rendered/metis-default.md',
    toolFilter: { deny: DENY_SPECIALISTS },
  },
  momus: {
    persona: 'roles/prompts/variants/specialists/momus-default.md',
    toolFilter: { deny: DENY_SPECIALISTS },
  },
  'multimodal-looker': {
    persona: 'roles/prompts/variants/specialists/multimodal-looker.md',
    toolFilter: { allow: ['read', 'read_image'] },
  },
  sisyphus: {
    persona: 'persona.md',
    toolFilter: { deny: DENY_PRIMARY },
  },
  hephaestus: {
    persona: 'roles/prompts/hephaestus.md',
    toolFilter: { deny: DENY_PRIMARY },
  },
  atlas: {
    persona: 'roles/prompts/atlas.md',
    toolFilter: { deny: DENY_PRIMARY },
  },
  'sisyphus-junior': {
    persona: 'roles/prompts/sisyphus-junior.md',
    toolFilter: { deny: DENY_PRIMARY },
  },
}

/**
 * dsh has no task-category system. These notes are prepended to a generic
 * subagent prompt so the child still gets the intended emphasis without
 * silently spawning a specialist.
 */
export const CATEGORY_PERSONA_NOTES = {
  'visual-engineering':
    'This task is about visual/frontend engineering. Prefer frontend skills, validate changes in a real browser when possible, and match the existing UI patterns and design language.',
  deep:
    'This is a deep-work task. Explore before editing, reason carefully about tradeoffs, and verify the result before reporting completion.',
  ultrabrain:
    'This is an ultrabrain task. Maximize reasoning depth and verification; do not take shortcuts, and double-check every non-obvious step.',
  quick:
    'This is a quick task. Make the smallest correct change, keep the blast radius minimal, and finish in one coherent edit.',
  writing:
    'This is a writing task. Prioritize clarity, structure, and reader value; produce prose or documentation rather than code.',
  git:
    'This is a git task. Never amend commits or force-push unless explicitly asked, and never use destructive git commands unless asked.',
}

const personaCache = new Map()

function personaText(subagentType) {
  const def = SUBAGENT_TYPE_DEFS[subagentType]
  if (def === undefined) return undefined
  const cached = personaCache.get(subagentType)
  if (cached !== undefined) return cached
  const text = readFileSync(new URL(def.persona, import.meta.url), 'utf8')
  personaCache.set(subagentType, text)
  return text
}

/**
 * Render the `<loaded_skills>` child-prompt prefix. dsh subagent requests have
 * no `load_skills` field, so the shim tells the child to load the named skills
 * first through dsh's own `skill` tool. An empty array adds nothing.
 */
export function renderLoadedSkills(loadSkills) {
  const skills = Array.isArray(loadSkills)
    ? loadSkills.filter(skill => typeof skill === 'string' && skill.length > 0)
    : []
  if (skills.length === 0) return ''
  return '\n\n<loaded_skills>\n'
    + `Load and follow these skills first via the skill tool: ${skills.join(', ')}.\n`
    + '</loaded_skills>\n'
}

/**
 * Resolve the model's routing inputs into one execution route.
 * Order: task_id -> subagent_type -> category -> generic.
 * Unknown named types and unknown categories throw with their known-value lists.
 */
export function resolveTaskRoute(args = {}) {
  if (typeof args.task_id === 'string' && args.task_id.length > 0) {
    return { kind: 'followup', taskId: args.task_id }
  }
  if (typeof args.subagent_type === 'string' && args.subagent_type.length > 0) {
    if (!KNOWN_SUBAGENT_TYPES.includes(args.subagent_type)) {
      throw new Error(
        `unknown subagent_type "${args.subagent_type}"; known types: ${KNOWN_SUBAGENT_TYPES.join(', ')}`,
      )
    }
    return { kind: 'subagent-type', subagentType: args.subagent_type }
  }
  if (typeof args.category === 'string' && args.category.length > 0) {
    if (!KNOWN_CATEGORIES.includes(args.category)) {
      throw new Error(
        `unknown task category "${args.category}"; known categories: ${KNOWN_CATEGORIES.join(', ')}`,
      )
    }
    return { kind: 'category', category: args.category }
  }
  return { kind: 'generic' }
}

/** Compose the final child prompt for fresh starts (not used for follow-ups). */
function composeChildPrompt(route, args) {
  const skills = renderLoadedSkills(args.load_skills)
  const prompt = String(args.prompt ?? '')
  if (route.kind !== 'category') return skills + prompt
  const note = CATEGORY_PERSONA_NOTES[route.category]
  const categoryBlock = `<omo-task-category category="${route.category}">\n${note}\n</omo-task-category>\n`
  return categoryBlock + skills + prompt
}

/** Label for a subagent request or background job. */
function labelFor(args) {
  return typeof args.description === 'string' && args.description.trim().length > 0
    ? args.description.trim()
    : 'omo task'
}

/** Join the text blocks of a child's final output. */
function outputValueText(values) {
  return (Array.isArray(values) ? values : [])
    .filter(value =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
      && value.type === 'text' && typeof value.text === 'string')
    .map(value => value.text)
    .join('')
}

function textBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopReasonError(result) {
  switch (result?.stopReason) {
    case 'completed':
      return undefined
    case 'aborted':
      return 'subagent run was cancelled'
    case 'error':
      return 'subagent run failed'
    case 'max-tokens':
      return 'subagent run hit its token limit before finishing'
    case 'refusal':
      return 'subagent declined the task'
    default:
      return `subagent run ended abnormally (${String(result?.stopReason)})`
  }
}

/** Preserve a truncated child's partial text in the error shown to the model. */
function withPartialText(error, output) {
  const text = textBlocks(output)
  return text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`
}

/** Settle a foreground run: collect its result, then dispose it. */
async function settleForegroundRun(run) {
  const [execution] = await Promise.allSettled([
    run.result.then((result) => {
      const error = stopReasonError(result)
      if (error !== undefined) throw new Error(withPartialText(error, result.output))
      return {
        kind: 'foreground',
        runId: run.id,
        output: result.output,
      }
    }),
  ])
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
  if (execution.status === 'rejected') {
    if (disposal.status === 'rejected') {
      throw new AggregateError(
        [execution.reason, disposal.reason],
        `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`,
      )
    }
    throw execution.reason
  }
  if (disposal.status === 'rejected') throw disposal.reason
  return execution.value
}

/** Map a settled one-shot run to the `ctx.jobs` outcome shape. */
function runOutcome(result) {
  switch (result?.stopReason) {
    case 'completed':
      return { status: 'completed', output: textBlocks(result.output) }
    case 'aborted':
      return { status: 'killed' }
    case 'error':
    case 'max-tokens':
    case 'refusal':
      return { status: 'failed', detail: result.stopReason }
    default:
      return { status: 'failed', detail: String(result?.stopReason) }
  }
}

/** Settle a background one-shot run into a job outcome without importing dsh-subagent. */
async function settleRun(run) {
  let outcome
  try {
    outcome = runOutcome(await run.result)
  } catch (error) {
    outcome = { status: 'failed', detail: String(error) }
  }
  try {
    await run.dispose()
  } catch (error) {
    const prefix = outcome.detail === undefined ? '' : `${outcome.detail}; `
    return { status: 'failed', detail: `${prefix}dispose failed: ${String(error)}` }
  }
  return outcome
}

/** Settle pending startup without rejecting the job producer contract. */
async function settleStart(start, signal) {
  try {
    return await settleRun(await start)
  } catch (error) {
    return signal.aborted
      ? { status: 'killed' }
      : { status: 'failed', detail: String(error) }
  }
}

/** Prefer continuable background children; fall back to a one-shot `ctx.jobs` task. */
async function startBackground(ctx, request, label, parent, exec) {
  const provider = typeof ctx.subagents?.getProvider === 'function'
    ? ctx.subagents.getProvider(PROVIDER)
    : undefined
  const canContinue = typeof ctx.subagents?.startContinuable === 'function'
    && (provider === undefined || provider.prepareContinuable !== undefined)
  if (canContinue) {
    const { label: _label, ...continuableRequest } = request
    void _label
    const started = await ctx.subagents.startContinuable({
      provider: PROVIDER,
      label,
      request: continuableRequest,
      signal: exec.signal,
    })
    return { kind: 'continuable', subagentId: started.childId }
  }

  const jobs = ctx.jobs
  if (jobs === undefined) {
    throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
  }
  const id = jobs.start({
    kind: 'subagent',
    label,
    owner: parent,
    run: () => {
      const controller = new AbortController()
      const start = ctx.subagents.start(PROVIDER, { ...request, signal: controller.signal })
      return {
        cancel: (reason) => {
          controller.abort(reason ?? 'background subagent task killed')
        },
        done: settleStart(start, controller.signal),
      }
    },
  })
  return { kind: 'background', jobId: id }
}

/** Deliver a follow-up to an existing continuable child. */
async function followup(ctx, args, taskId, parent, exec) {
  if (typeof ctx.subagents?.followup !== 'function') {
    throw new Error(
      'task_id requires continuable subagent follow-up, but ctx.subagents.followup is unavailable in this composition; only fresh tasks are supported',
    )
  }
  const promptText = renderLoadedSkills(args.load_skills) + String(args.prompt ?? '')
  await ctx.subagents.followup(
    parent,
    taskId,
    [{ type: 'text', text: promptText }],
    { source: { kind: 'user' }, signal: exec.signal },
  )
  return { kind: 'continuable', subagentId: taskId }
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'task',
    description:
      'Omo-compatible task delegation. Start a fresh specialist or generic subagent, '
      + 'or continue an existing continuable child by task_id. Foreground calls wait for the '
      + 'result; background calls return a durable subagent id. Set run_in_background only when '
      + 'your next action does not depend on that result.',
    parameters: {
      description: {
        type: 'string',
        description: 'A short (3-5 word) description of the delegated task; becomes the subagent label.',
      },
      prompt: {
        type: 'string',
        required: true,
        description:
          'The complete, self-contained task for the subagent. The child does not share this '
          + 'conversation, so include everything it needs.',
      },
      category: {
        type: 'string',
        description:
          'Optional omo task category. dsh has no category system, so this maps to a generic '
          + 'subagent persona note. Known: visual-engineering, deep, ultrabrain, quick, writing, git.',
      },
      subagent_type: {
        type: 'string',
        description:
          'Optional named specialist. Known: oracle, librarian, explore, metis, momus, '
          + 'multimodal-looker, sisyphus, hephaestus, atlas, sisyphus-junior.',
      },
      load_skills: {
        type: 'array',
        items: { type: 'string' },
        default: [],
        description:
          'Skills the child should load first. dsh subagent requests cannot carry skills, so '
          + 'these are prepended to the child prompt as an instruction to use the skill tool.',
      },
      run_in_background: {
        type: 'boolean',
        description:
          'Whether to run in the background and return a durable subagent id immediately. '
          + 'Defaults to false; set true when the result is not needed before the next action.',
      },
      task_id: {
        type: 'string',
        description:
          'Continuable child session id (e.g. ses_...) from a previous task() call. When set, '
          + 'the prompt is delivered as the next turn of that existing child.',
      },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'background' },
              jobId: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'continuable' },
              subagentId: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'foreground' },
              runId: { type: 'string', required: true },
              output: { type: 'array', required: true, items: { type: 'json' } },
            },
          },
        ],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.kind === 'background'
          ? `started background subagent task ${value.jobId}`
          : value.kind === 'continuable'
            ? `started subagent ${value.subagentId}`
            : outputValueText(value.output),
      }],
    },
    // Children never mutate the parent session; task starts are synchronous
    // commutative insertions.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) {
        throw new Error('task tool requires a calling agent (exec.agent was undefined)')
      }

      const route = resolveTaskRoute(args)
      if (route.kind === 'followup') {
        return followup(ctx, args, route.taskId, parent, exec)
      }

      const label = labelFor(args)
      const request = {
        label,
        prompt: [{ type: 'text', text: composeChildPrompt(route, args) }],
        parent,
      }
      if (route.kind === 'subagent-type') {
        const def = SUBAGENT_TYPE_DEFS[route.subagentType]
        request.persona = personaText(route.subagentType)
        request.toolFilter = def.toolFilter
      }

      if (args.run_in_background === true) {
        return startBackground(ctx, request, label, parent, exec)
      }

      const run = await ctx.subagents.start(PROVIDER, { ...request, signal: exec.signal })
      return settleForegroundRun(run)
    },
  }))
}
