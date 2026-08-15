// omo's comment-checker hook: blocks AI-slop comments on write/edit, replicating
// the core of @code-yeongyu/comment-checker as a scoped tools/pre-execute guard.
export const name = 'opencode-omo-comment-checker'

const SLOP_PATTERNS = [
  /\bobviously\b/i,
  /\bclearly\b/i,
  /\bsimply\b/i,
  /\bbasically\b/i,
  /\bof course\b/i,
  /\bas you can see\b/i,
  /\bit('s| is) worth noting\b/i,
  /\bit is important to note\b/i,
  /\bthis (function|method|class|code|file|line) (is|does|will|adds|returns|handles)/i,
]

function detectSlop(name, args) {
  let content
  if (name === 'write' && typeof args?.content === 'string') content = args.content
  else if (name === 'edit' && typeof args?.new_string === 'string') content = args.new_string
  else return undefined

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!(trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('<!--'))) continue
    for (const pattern of SLOP_PATTERNS) {
      if (pattern.test(trimmed)) {
        return 'comment-checker: AI-slop comment rejected: ' + trimmed.slice(0, 120)
      }
    }
  }
  return undefined
}

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    const reason = detectSlop(exec.name, exec.arguments)
    if (reason !== undefined) return { kind: 'deny', reason }
    return next()
  })
}
