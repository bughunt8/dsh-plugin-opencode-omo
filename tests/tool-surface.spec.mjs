/**
 * Pure-function tests for the opencode-omo tool surface. These assert the
 * model-visible descriptions and parameter names without booting dsh: the
 * execution shims are thin defineTool wrappers around the original registry
 * definitions and are covered here through their converters and the surface
 * they project.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyOpencodeSurface,
  bashDescription,
  name,
  opencodeToolSurface,
  toDshEditArgs,
  toDshReadArgs,
  toDshWriteArgs,
} from '../presets/opencode-omo/tool-surface.mjs'

test('module identity', () => {
  assert.equal(name, 'opencode-omo-tool-surface')
})

test('descriptions are the opencode .txt texts', () => {
  const surface = opencodeToolSurface({ year: 2026, platform: 'linux', tmp: '/tmp' })
  assert.match(surface.descriptions.read, /Read a file or directory from the local filesystem/)
  assert.match(surface.descriptions.read, /The filePath parameter should be an absolute path/)
  assert.match(surface.descriptions.edit, /Performs exact string replacements in files/)
  assert.match(surface.descriptions.write, /Writes a file to the local filesystem/)
  assert.match(surface.descriptions.glob, /Fast file pattern matching tool that works with any codebase size/)
  assert.match(surface.descriptions.grep, /Fast content search tool that works with any codebase size/)
  assert.match(surface.descriptions.todo_write, /Create and maintain a structured task list for the current coding session/)
  assert.match(surface.descriptions.skill, /Load a specialized skill when the task at hand matches one of the skills listed in the system prompt/)
  assert.match(surface.descriptions.web_fetch, /Fetches content from a specified URL/)
  assert.match(surface.descriptions.web_search, /Search the web using the session's web search provider/)
  assert.match(surface.descriptions.web_search, /The current year is 2026/)
  assert.match(surface.descriptions.bash, /Executes a given bash command in a persistent shell session/)
  assert.match(surface.descriptions.bash, /# Git and GitHub/)
})

test('read carries opencode image guidance only when read_image is absent', () => {
  const without = opencodeToolSurface({ readImagePresent: false })
  const withImage = opencodeToolSurface({ readImagePresent: true })
  assert.match(without.descriptions.read, /This tool can read image files and PDFs and return them as file attachments/)
  assert.doesNotMatch(withImage.descriptions.read, /This tool can read image files and PDFs and return them as file attachments/)
  assert.match(withImage.descriptions.read, /Read a file or directory from the local filesystem/)
})

test('parameters use opencode names for shimmed and name-safe tools', () => {
  const { parameters } = opencodeToolSurface()
  assert.ok(parameters.read.filePath.required)
  assert.equal(parameters.read.filePath.description, 'The absolute path to the file or directory to read')
  assert.ok(parameters.read.offset)
  assert.ok(parameters.read.limit)
  assert.equal(parameters.read.file_path, undefined)

  assert.ok(parameters.edit.filePath.required)
  assert.ok(parameters.edit.oldString.required)
  assert.ok(parameters.edit.newString.required)
  assert.equal(parameters.edit.replaceAll.type, 'boolean')
  assert.equal(parameters.edit.file_path, undefined)

  assert.ok(parameters.write.filePath.required)
  assert.ok(parameters.write.content.required)
  assert.equal(parameters.write.file_path, undefined)

  assert.ok(parameters.glob.pattern.required)
  assert.ok(parameters.glob.path)
  assert.equal(parameters.glob.path.type, 'string')

  assert.ok(parameters.grep.pattern.required)
  assert.ok(parameters.grep.path)
  assert.ok(parameters.grep.include)

  assert.ok(parameters.skill.name.required)

  assert.ok(parameters.bash.command.required)
  assert.equal(parameters.bash.command.description, 'The command to execute')

  assert.ok(parameters.web_search.query.required)
  assert.equal(parameters.web_search.query.description, 'Websearch query')

  assert.ok(parameters.web_fetch.url.required)
  assert.equal(parameters.web_fetch.url.description, 'The URL to fetch content from')
})

test('arg converters map opencode names to dsh names', () => {
  assert.deepEqual(toDshReadArgs({ filePath: '/tmp/a.txt', offset: 10, limit: 40 }), {
    file_path: '/tmp/a.txt',
    offset: 10,
    limit: 40,
  })
  assert.deepEqual(toDshReadArgs({ filePath: '/tmp/a.txt' }), { file_path: '/tmp/a.txt' })

  assert.deepEqual(toDshEditArgs({ filePath: '/tmp/a.txt', oldString: 'a', newString: 'b', replaceAll: true }), {
    file_path: '/tmp/a.txt',
    old_string: 'a',
    new_string: 'b',
    replace_all: true,
  })
  assert.deepEqual(toDshEditArgs({ filePath: '/tmp/a.txt', oldString: 'a', newString: 'b' }), {
    file_path: '/tmp/a.txt',
    old_string: 'a',
    new_string: 'b',
  })

  assert.deepEqual(toDshWriteArgs({ filePath: '/tmp/a.txt', content: 'hello' }), {
    file_path: '/tmp/a.txt',
    content: 'hello',
  })
})

test('applyOpencodeSurface rewrites matched tools and leaves others untouched', () => {
  const original = [
    { name: 'read', description: 'dsh read', parameters: { type: 'object', properties: { file_path: {} } } },
    { name: 'write', description: 'dsh write', parameters: { type: 'object', properties: { file_path: {}, content: {} } } },
    { name: 'todo_write', description: 'dsh todo', parameters: { type: 'object', properties: { todos: {} } } },
    { name: 'apply_patch', description: 'keep me', parameters: { type: 'object', properties: { patch_text: {} } } },
  ]
  const surface = applyOpencodeSurface(original, { year: 2026 })
  assert.match(surface[0].description, /Read a file or directory from the local filesystem/)
  assert.ok(surface[0].parameters.properties.filePath)
  assert.equal(surface[0].parameters.properties.file_path, undefined)

  assert.match(surface[1].description, /Writes a file to the local filesystem/)
  assert.ok(surface[1].parameters.properties.filePath)
  assert.ok(surface[1].parameters.properties.content)

  assert.match(surface[2].description, /Create and maintain a structured task list for the current coding session/)
  assert.ok(surface[2].parameters.properties.todos)

  assert.equal(surface[3].description, 'keep me')
  assert.ok(surface[3].parameters.properties.patch_text)
})

test('applyOpencodeSurface detects read_image presence for read guidance', () => {
  const tools = [
    { name: 'read', description: 'dsh read', parameters: {} },
    { name: 'read_image', description: 'dsh image', parameters: {} },
  ]
  const surface = applyOpencodeSurface(tools)
  assert.doesNotMatch(surface[0].description, /read image files and PDFs/)
  assert.equal(surface[1].description, 'dsh image')
})

test('bash description renders every shell.txt placeholder', () => {
  const description = bashDescription({ platform: 'linux', tmp: '/tmp', year: 2026 })
  assert.doesNotMatch(description, /\$\{/)
  assert.match(description, /OS: linux, Shell: bash/)
  assert.match(description, /Use `\/tmp` for temporary work outside the workspace/)
})
