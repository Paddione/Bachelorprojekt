/**
 * scripts/factory/partial-order.test.mjs
 *
 * Unit tests for partial-order.cjs: topo-sort, ready-filter, done-skip.
 * Run: node --test scripts/factory/partial-order.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { topoSort, readyPartials, orderAndFilter } from './partial-order.cjs'

describe('topoSort', () => {
  it('returns ids in dependency order', () => {
    const manifest = [
      { id: 'p1', depends_on: ['p3'] },
      { id: 'p2', depends_on: ['p1'] },
      { id: 'p3', depends_on: [] },
    ]
    const result = topoSort(manifest)
    assert.ok(result.indexOf('p3') < result.indexOf('p1'), 'p3 before p1')
    assert.ok(result.indexOf('p1') < result.indexOf('p2'), 'p1 before p2')
  })

  it('throws on dependency cycle', () => {
    const manifest = [
      { id: 'p1', depends_on: ['p2'] },
      { id: 'p2', depends_on: ['p1'] },
    ]
    assert.throws(() => topoSort(manifest), /D2: dependency cycle/)
  })

  it('throws on unknown depends_on id', () => {
    const manifest = [
      { id: 'p1', depends_on: ['p9'] },
    ]
    assert.throws(() => topoSort(manifest), /D2: unknown depends_on id: p9/)
  })

  it('handles empty manifest', () => {
    assert.deepEqual(topoSort([]), [])
  })

  it('handles undefined depends_on as no edges', () => {
    const manifest = [{ id: 'p1' }, { id: 'p2' }]
    const result = topoSort(manifest)
    assert.equal(result.length, 2)
  })
})

describe('readyPartials', () => {
  it('returns partials with all dependencies done', () => {
    const manifest = [
      { id: 'p1', depends_on: [] },
      { id: 'p2', depends_on: ['p1'] },
      { id: 'p3', depends_on: ['p1', 'p2'] },
    ]
    const result = readyPartials(manifest, [])
    assert.deepEqual(result, ['p1'])

    const result2 = readyPartials(manifest, ['p1'])
    assert.deepEqual(result2, ['p2'])

    const result3 = readyPartials(manifest, ['p1', 'p2'])
    assert.deepEqual(result3, ['p3'])
  })

  it('excludes done partials', () => {
    const manifest = [
      { id: 'p1', depends_on: [] },
      { id: 'p2', depends_on: [] },
    ]
    const result = readyPartials(manifest, ['p1'])
    assert.deepEqual(result, ['p2'])
  })
})

describe('orderAndFilter', () => {
  it('returns topo-ordered non-done partials', () => {
    const manifest = [
      { id: 'p1', depends_on: ['p3'] },
      { id: 'p2', depends_on: ['p1'] },
      { id: 'p3', depends_on: [] },
    ]
    const result = orderAndFilter(manifest, ['p3'])
    assert.ok(result.indexOf('p1') < result.indexOf('p2'), 'p1 before p2')
    assert.ok(!result.includes('p3'), 'p3 excluded (done)')
  })

  it('returns all when nothing done', () => {
    const manifest = [
      { id: 'p1', depends_on: [] },
      { id: 'p2', depends_on: ['p1'] },
    ]
    const result = orderAndFilter(manifest, [])
    assert.equal(result.length, 2)
    assert.ok(result.indexOf('p1') < result.indexOf('p2'))
  })
})
