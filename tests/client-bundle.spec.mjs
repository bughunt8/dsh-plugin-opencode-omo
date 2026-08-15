/**
 * Browser-bundle smoke test: evaluate the built client.js with a minimal
 * module-loader mock and assert the wrapper registers the package id and
 * exposes the plugin apply face. This catches banner/footer regressions
 * without a browser.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function loadClientBundle() {
  const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const react = {
    createElement: () => null,
    useState: () => [null, () => {}],
    useEffect: () => {},
    useMemo: fn => fn(),
    useRef: () => ({}),
  }
  const modules = {
    'react': react,
    'react/jsx-runtime': react,
    '@deepseek-ai/cordis': {
      Context: class {},
      Service: class { constructor(ctx, name) { this.ctx = ctx; this.name = name } },
    },
    '@deepseek-ai/dsh-client-ui-slots': {},
    '@deepseek-ai/dsh-client-web-react': {},
    '@deepseek-ai/dsh-client-ui-primitives': {
      IconChevronDownOutline14: () => null,
      Menu: () => null,
      Modal: () => null,
    },
    '@deepseek-ai/dsh-client-schema-form': {},
  }
  const loaded = {}
  const context = {
    console,
    window: { __ModuleLoader__: { load: ({ id, factory }) => { loaded.id = id; loaded.factory = factory } } },
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  assert.equal(loaded.id, '@royenheart/dsh-plugin-opencode-omo')
  return loaded.factory(id => {
    if (!(id in modules)) throw new Error(`unexpected client require: ${id}`)
    return modules[id]
  })
}

test('client bundle loads under the module loader and exports the plugin face', () => {
  const exportsObj = loadClientBundle()
  assert.equal(exportsObj.name, 'opencode-omo-client')
  assert.equal(JSON.stringify(exportsObj.inject), JSON.stringify(['slots', 'connection']))
  assert.equal(typeof exportsObj.apply, 'function')
  assert.equal(exportsObj.ROLES_ENDPOINT, '/plugins/@royenheart/dsh-plugin-opencode-omo/roles')
  assert.equal(typeof exportsObj.RoleSelect, 'function')
  assert.equal(typeof exportsObj.RoleSettingsSection, 'function')
})
