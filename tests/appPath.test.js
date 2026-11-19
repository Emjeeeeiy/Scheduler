import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAppPath } from '../src/lib/appPath.js'

describe('isAppPath', () => {
  it('accepts the addresses the app is served at', () => {
    assert.equal(isAppPath('/'), true)
    assert.equal(isAppPath('/index.html'), true)
    assert.equal(isAppPath(''), true)
  })

  it('rejects any other path, so a stale link gets the 404 page', () => {
    for (const path of ['/foo', '/foo/', '/settings', '/index.html/x', '//', '/mcp', '/?view=focus']) {
      assert.equal(isAppPath(path), false, path)
    }
  })

  // Regression guard: the launch parameters (`/?view=focus`, `/?new=task`) are
  // read from `location.search`, never the pathname, and App passes only the
  // pathname here. A caller handing in a whole URL would 404 every shortcut.
  it('judges the pathname alone, not a URL with a query', () => {
    assert.equal(isAppPath('/?new=task'), false)
  })
})
