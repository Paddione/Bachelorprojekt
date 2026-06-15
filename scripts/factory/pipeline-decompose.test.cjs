const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const D = require('./pipeline-decompose.cjs')

test('chooseModel: complexity maps to expected tier', () => {
  assert.equal(D.chooseModel('simple', 'implement'), 'haiku')
  assert.equal(D.chooseModel('medium', 'implement'), 'sonnet')
  assert.equal(D.chooseModel('complex', 'implement'), 'opus')
})

test('chooseModel: review/security are always opus', () => {
  assert.equal(D.chooseModel('simple', 'review'), 'opus')
  assert.equal(D.chooseModel('simple', 'security'), 'opus')
  assert.equal(D.chooseModel('medium', 'security'), 'opus')
  assert.equal(D.chooseModel('complex', 'review'), 'opus')
})

test('chooseModel: unknown complexity returns null', () => {
  assert.equal(D.chooseModel(undefined, 'implement'), null)
  assert.equal(D.chooseModel('bogus', 'implement'), null)
})

test('chooseEffort: base effort from complexity (ample budget)', () => {
  assert.equal(D.chooseEffort('simple', 'low', 1.0), 'quick')
  assert.equal(D.chooseEffort('medium', 'low', 1.0), 'standard')
  assert.equal(D.chooseEffort('complex', 'low', 1.0), 'ultra')
})

test('chooseEffort: high risk bumps up one step', () => {
  assert.equal(D.chooseEffort('simple', 'high', 1.0), 'standard')
  assert.equal(D.chooseEffort('medium', 'high', 1.0), 'ultra')
  assert.equal(D.chooseEffort('complex', 'high', 1.0), 'ultra')
})

test('chooseEffort: low budget down-scales', () => {
  assert.equal(D.chooseEffort('complex', 'low', 0.2), 'standard')
  assert.equal(D.chooseEffort('medium', 'low', 0.2), 'quick')
  assert.equal(D.chooseEffort('simple', 'low', 0.05), 'quick')
})

test('chooseEffort: unknown complexity defaults to standard', () => {
  assert.equal(D.chooseEffort('bogus', 'low', 1.0), 'standard')
  assert.equal(D.chooseEffort('bogus', 'low', 0.1), 'quick')
})

test('provision: aggregates model + effort + contextHints', () => {
  const out = D.provision({ complexity: 'medium', role: 'implement', risk: 'low', budgetRemaining: 1.0, touchedFiles: ['x.ts'], gpuEmbeddings: false })
  assert.equal(out.model, 'sonnet')
  assert.equal(out.effort, 'standard')
  assert.ok(Array.isArray(out.contextHints))
  for (const h of out.contextHints) {
    assert.equal(typeof h, 'string')
    assert.ok(h.length < 120, `hint too long: ${h}`)
  }
  assert.ok(out.contextHints.some((h) => h.includes('touched_files')))
})

test('provision: GPU-gated similar-tickets hint', () => {
  const withGpu = D.provision({ complexity: 'complex', role: 'plan', risk: 'high', budgetRemaining: 1, touchedFiles: [], gpuEmbeddings: true })
  const noGpu = D.provision({ complexity: 'complex', role: 'plan', risk: 'high', budgetRemaining: 1, touchedFiles: [], gpuEmbeddings: false })
  assert.ok(withGpu.contextHints.some((h) => h.includes('similar-tickets')))
  assert.ok(!noGpu.contextHints.some((h) => h.includes('similar-tickets')))
})

describe('assignFiles', () => {
  const sharedList = ['k3d/configmap-domains.yaml']

  test('assigns files based on domain match', () => {
    const subs = [{ id: 'sf-1', domains: ['website'] }, { id: 'sf-2', domains: ['db'] }]
    const files = ['website/src/page.tsx', 'db/schema.sql']
    const result = D.assignFiles(subs, files, sharedList)
    assert.deepEqual(result[0].assignedFiles, ['website/src/page.tsx'])
    assert.deepEqual(result[1].assignedFiles, ['db/schema.sql'])
  })

  test('shared file goes to first sub-feature only', () => {
    const subs = [{ id: 'sf-1', domains: ['k3d'] }, { id: 'sf-2', domains: ['k3d'] }]
    const files = ['k3d/configmap-domains.yaml', 'k3d/kustomization.yaml']
    const result = D.assignFiles(subs, files, sharedList)
    assert.ok(result[0].assignedFiles.includes('k3d/configmap-domains.yaml'))
    assert.ok(!result[1].assignedFiles.includes('k3d/configmap-domains.yaml'))
    assert.equal(result[0].shared_changes, true)
  })

  test('sub-feature without domains gets empty assignedFiles', () => {
    const subs = [{ id: 'sf-1' }]
    const files = ['website/page.tsx']
    const result = D.assignFiles(subs, files, sharedList)
    assert.deepEqual(result[0].assignedFiles, [])
  })

  test('no duplicate file across sub-features', () => {
    const subs = [{ id: 'sf-1', domains: ['website'] }, { id: 'sf-2', domains: ['website'] }]
    const files = ['website/a.ts', 'website/b.ts']
    const result = D.assignFiles(subs, files, sharedList)
    const allFiles = result.flatMap((sf) => sf.assignedFiles)
    assert.equal(new Set(allFiles).size, allFiles.length)
  })
})

describe('validateDisjoint', () => {
  test('passes when files are disjoint', () => {
    const subs = [{ id: 'a', assignedFiles: ['a.ts'] }, { id: 'b', assignedFiles: ['b.ts'] }]
    D.validateDisjoint(subs)
  })

  test('throws when file appears in two sub-features', () => {
    const subs = [{ id: 'a', assignedFiles: ['shared.ts'] }, { id: 'b', assignedFiles: ['shared.ts'] }]
    assert.throws(() => D.validateDisjoint(subs), /shared\.ts/)
  })

  test('passes when no assignedFiles on some sub-features', () => {
    const subs = [{ id: 'a', assignedFiles: ['a.ts'] }, { id: 'b' }]
    D.validateDisjoint(subs)
  })
})
