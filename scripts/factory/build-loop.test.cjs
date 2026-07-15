const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const BL = require('./build-loop.cjs')

test('normalize: removes absolute paths', () => {
  const input = 'Error in /home/user/project/src/foo.ts: line 42'
  const out = BL.normalize(input)
  assert.ok(!out.includes('/home/user'))
  assert.ok(out.includes('<PATH>'))
})

test('normalize: removes timestamps', () => {
  const input = '2026-06-16T10:30:00.123Z failing test'
  const out = BL.normalize(input)
  assert.ok(!out.includes('2026-06-16T10:30:00.123Z'))
  assert.ok(out.includes('failing test'))
})

test('normalize: removes worktree paths', () => {
  const input = 'Error in /tmp/wt-t000884/src/bar.ts'
  const out = BL.normalize(input)
  assert.ok(!out.includes('/tmp/wt-t000884'))
  assert.ok(out.includes('<WT>'))
})

test('normalize: removes line numbers in brackets', () => {
  const input = '  [42m] done\nline'
  const out = BL.normalize(input)
  assert.ok(out.includes('line'))
})

test('normalize: empty input returns empty string', () => {
  assert.equal(BL.normalize(''), '')
  assert.equal(BL.normalize(null), '')
  assert.equal(BL.normalize(undefined), '')
})

test('sigHash: same input same hash', () => {
  const a = BL.sigHash('hello world')
  const b = BL.sigHash('hello world')
  assert.equal(a, b)
})

test('sigHash: noise does not change hash', () => {
  const base = 'Error: test failed\n'
  const noisyA = base + '/home/user/src/foo.ts:1'
  const noisyB = base + '/home/other/src/bar.ts:42'
  assert.equal(BL.sigHash(noisyA), BL.sigHash(noisyB))
})

test('decide: allowed classify returns continue', () => {
  const r = BL.decide({ iteration: 0, max: 3, prevHash: null, classify: 'test', escalatePaths: false })
  assert.equal(r.action, 'continue')
})

test('decide: disallowed classify returns escalate-gate', () => {
  const r = BL.decide({ iteration: 0, max: 3, prevHash: null, classify: 'secret', escalatePaths: false })
  assert.equal(r.action, 'abort')
  assert.equal(r.reason, 'escalate-gate')
})

test('decide: escalate paths returns escalate-gate', () => {
  const r = BL.decide({ iteration: 0, max: 3, prevHash: null, classify: 'test', escalatePaths: true })
  assert.equal(r.action, 'abort')
  assert.equal(r.reason, 'escalate-gate')
})

test('decide: max iterations returns abort', () => {
  const r = BL.decide({ iteration: 3, max: 3, prevHash: null, classify: 'test', escalatePaths: false })
  assert.equal(r.action, 'abort')
  assert.equal(r.reason, 'max-iterations')
})

test('decide: iteration beyond max returns abort', () => {
  const r = BL.decide({ iteration: 5, max: 3, prevHash: null, classify: 'test', escalatePaths: false })
  assert.equal(r.action, 'abort')
  assert.equal(r.reason, 'max-iterations')
})

test('decide: no-progress when hash unchanged', () => {
  const hash = 'abc123'
  const r = BL.decide({ iteration: 1, max: 3, prevHash: hash, hash, classify: 'test', escalatePaths: false })
  assert.equal(r.action, 'abort')
  assert.equal(r.reason, 'no-progress')
})

test('decide: progress continues when hash changes', () => {
  const r = BL.decide({ iteration: 1, max: 3, prevHash: 'old', hash: 'new', classify: 'test', escalatePaths: false })
  assert.equal(r.action, 'continue')
})

test('decide: default max is 3', () => {
  const r = BL.decide({ iteration: 3, max: null, prevHash: null, classify: 'test', escalatePaths: false })
  assert.equal(r.action, 'abort')
  assert.equal(r.reason, 'max-iterations')
})

test('feedbackBlock: includes classify', () => {
  const fb = BL.feedbackBlock({ classify: 'test', logTail: 'log', attempts: [] })
  assert.ok(fb.includes('FAILURE CLASS: test'))
})

test('feedbackBlock: includes log tail', () => {
  const fb = BL.feedbackBlock({ classify: 'lint', logTail: 'line1\nline2\n', attempts: [] })
  assert.ok(fb.includes('LOG TAIL'))
  assert.ok(fb.includes('line1'))
})

test('feedbackBlock: includes attempts history', () => {
  const fb = BL.feedbackBlock({ classify: 'test', logTail: '', attempts: ['fixed X', 'fixed Y'] })
  assert.ok(fb.includes('PREVIOUS ATTEMPTS (2)'))
  assert.ok(fb.includes('fixed X'))
  assert.ok(fb.includes('fixed Y'))
})

test('feedbackBlock: empty attempts renders cleanly', () => {
  const fb = BL.feedbackBlock({ classify: 'test', logTail: '', attempts: [] })
  assert.ok(fb.includes('FAILURE CLASS'))
  assert.ok(!fb.includes('PREVIOUS ATTEMPTS (0)'))
})

test('resolveAgentModel: passes through a valid harness tier unchanged', () => {
  const logs = []
  const model = BL.resolveAgentModel({ modelId: 'opus', baseUrl: null }, 'sonnet', (m) => logs.push(m))
  assert.equal(model, 'opus')
  assert.equal(logs.length, 0)
})

test('resolveAgentModel: passes through baseUrl model as object', () => {
  const logs = []
  const model = BL.resolveAgentModel(
    { provider: 'lmstudio', modelId: 'qwen3.6-14b-a3b-fablevibes', baseUrl: 'http://127.0.0.1:1234' },
    'sonnet',
    (m) => logs.push(m)
  )
  assert.equal(model.provider, 'lmstudio')
  assert.equal(model.modelId, 'qwen3.6-14b-a3b-fablevibes')
  assert.equal(model.baseUrl, 'http://127.0.0.1:1234')
  assert.equal(logs.length, 1)
  assert.ok(logs[0].includes('baseUrl passthrough'))
})

test('resolveAgentModel: falls back when no provider in route', () => {
  const logs = []
  const model = BL.resolveAgentModel(
    { modelId: 'qwen3.5-9b@iq4_xs', baseUrl: 'http://100.102.71.114:1234/v1' },
    'sonnet',
    (m) => logs.push(m)
  )
  assert.equal(model, 'sonnet')
  assert.equal(logs.length, 1)
})

test('resolveAgentModel: null/undefined route falls back without throwing', () => {
  const logs = []
  assert.equal(BL.resolveAgentModel(null, 'sonnet', (m) => logs.push(m)), 'sonnet')
  assert.equal(BL.resolveAgentModel(undefined, 'haiku', (m) => logs.push(m)), 'haiku')
  assert.equal(logs.length, 0)
})
