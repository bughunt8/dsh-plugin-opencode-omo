// opencode's apply_patch tool: file-oriented patch (Add/Update/Delete/Move) with
// @@-anchored hunks, applied atomically through ctx.fs. This replicates the
// core of opencode's primary edit tool (its apply_patch.txt format).
import { defineTool } from '@deepseek-ai/dsh-tools'
import { unlinkSync } from 'node:fs'

export const name = 'opencode-omo-apply-patch'
export const inject = ['tools', 'fs']

function parsePatch(patchText) {
  const ops = []
  let current
  for (const raw of patchText.split(/\r?\n/)) {
    const line = raw
    if (line.startsWith('*** Begin Patch') || line.trim() === '') continue
    if (line.startsWith('*** End Patch')) break
    const addMatch = line.match(/^\*\*\* Add File:?\s*(.*)$/)
    const delMatch = line.match(/^\*\*\* Delete File:?\s*(.*)$/)
    const updMatch = line.match(/^\*\*\* Update File:?\s*(.*)$/)
    const movMatch = line.match(/^\*\*\* Move to:?\s*(.*)$/)
    if (addMatch) {
      current = { kind: 'add', path: addMatch[1].trim(), lines: [] }
      ops.push(current)
    } else if (delMatch) {
      current = { kind: 'delete', path: delMatch[1].trim() }
      ops.push(current)
    } else if (updMatch) {
      current = { kind: 'update', path: updMatch[1].trim(), moveTo: undefined, hunks: [] }
      ops.push(current)
    } else if (movMatch) {
      if (current?.kind === 'update') current.moveTo = movMatch[1].trim()
    } else if (line.startsWith('@@')) {
      if (current?.kind === 'update') current.hunks.push({ context: line.slice(2).trim(), old: [], new: [] })
    } else if (line.startsWith('+')) {
      if (current?.kind === 'add') current.lines.push(line.slice(1))
      else if (current?.kind === 'update') current.hunks[current.hunks.length - 1]?.new.push(line.slice(1))
    } else if (line.startsWith('-')) {
      if (current?.kind === 'update') current.hunks[current.hunks.length - 1]?.old.push(line.slice(1))
    }
  }
  return ops
}

function applyHunks(content, hunks) {
  const lines = content.split(/\r?\n/)
  for (const hunk of hunks) {
    const idx = hunk.context === '' ? 0 : lines.findIndex((l) => l === hunk.context)
    if (idx === -1) throw new Error('apply_patch: context not found: ' + hunk.context)
    const start = hunk.context === '' ? 0 : idx + 1
    const actual = lines.slice(start, start + hunk.old.length)
    if (!hunk.old.every((l, i) => actual[i] === l)) {
      throw new Error('apply_patch: hunk does not match at context: ' + hunk.context)
    }
    lines.splice(start, hunk.old.length, ...hunk.new)
  }
  return lines.join(String.fromCharCode(10))
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'apply_patch',
    description: 'Apply a file-oriented patch to create, update, move, or delete files. Format: *** Begin Patch ... *** End Patch, with *** Add File / Update File / Delete File headers and @@-anchored hunks of -/+ lines.',
    parameters: {
      patch_text: { type: 'string', required: true, description: 'The full patch text describing all changes.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          applied: {
            type: 'array',
            required: true,
            items: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string' }, path: { type: 'string' } } },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: 'Applied patch: ' + value.applied.map((r) => r.kind + ' ' + r.path).join('; '),
      }],
    },
    async execute(args, exec) {
      const ops = parsePatch(args.patch_text)
      if (ops.length === 0) throw new Error('apply_patch: no file operations found in patch')
      const cwd = exec.agent?.session.header.cwd
      const applied = []
      for (const op of ops) {
        const target = await ctx.fs.resolve(op.path, { cwd, signal: exec.signal })
        if (op.kind === 'add') {
          await ctx.fs.writeText(target, op.lines.join(String.fromCharCode(10)) + String.fromCharCode(10), undefined, exec.signal)
          applied.push({ kind: 'add', path: op.path })
        } else if (op.kind === 'delete') {
          unlinkSync(ctx.fs.processPath(target))
          applied.push({ kind: 'delete', path: op.path })
        } else {
          const content = await ctx.fs.readText(target, exec.signal)
          const updated = applyHunks(content, op.hunks)
          if (op.moveTo !== undefined) {
            const moved = await ctx.fs.resolve(op.moveTo, { cwd, signal: exec.signal })
            await ctx.fs.writeText(moved, updated, undefined, exec.signal)
            unlinkSync(ctx.fs.processPath(target))
            applied.push({ kind: 'update', path: op.moveTo })
          } else {
            await ctx.fs.writeText(target, updated, undefined, exec.signal)
            applied.push({ kind: 'update', path: op.path })
          }
        }
      }
      return { applied }
    },
  }))
}
