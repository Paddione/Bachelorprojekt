// scripts/factory/provision.test.mjs
// Pure-function tests for the adaptive provisioning module. Zero deps, zero I/O.
// Run: node --test scripts/factory/provision.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseModel } from './provision.js'

test('chooseModel: complexity → tier for implementer roles', () => {
  assert.equal(chooseModel('simple', 'implement'), 'haiku')
  assert.equal(chooseModel('medium', 'implement'), 'sonnet')
  assert.equal(chooseModel('complex', 'implement'), 'opus')
})

test('chooseModel: review/security roles are always opus regardless of complexity', () => {
  assert.equal(chooseModel('simple', 'review'), 'opus')
  assert.equal(chooseModel('simple', 'security'), 'opus')
  assert.equal(chooseModel('medium', 'security'), 'opus')
  assert.equal(chooseModel('complex', 'review'), 'opus')
})

test('chooseModel: scout/plan follow complexity like implement', () => {
  assert.equal(chooseModel('simple', 'scout'), 'haiku')
  assert.equal(chooseModel('complex', 'plan'), 'opus')
})

test('chooseModel: unknown complexity → null (omit/inherit, never guess)', () => {
  assert.equal(chooseModel(undefined, 'implement'), null)
  assert.equal(chooseModel('bogus', 'implement'), null)
})

// ── chooseEffort ──────────────────────────────────────────────────────────
import { chooseEffort } from './provision.js'

test('chooseEffort: base profile from complexity×risk (ample budget)', () => {
  // budgetRemaining = 1.0 (fraction of token budget left) → no down-scaling
  assert.equal(chooseEffort('simple', 'low', 1.0), 'quick')
  assert.equal(chooseEffort('medium', 'low', 1.0), 'standard')
  assert.equal(chooseEffort('complex', 'low', 1.0), 'ultra')
})

test('chooseEffort: high risk bumps the profile up one step (capped at ultra)', () => {
  assert.equal(chooseEffort('simple', 'high', 1.0), 'standard')
  assert.equal(chooseEffort('medium', 'high', 1.0), 'ultra')
  assert.equal(chooseEffort('complex', 'high', 1.0), 'ultra') // already top, stays ultra
})

test('chooseEffort: low remaining budget down-scales the profile (cost cap respect)', () => {
  // < 0.25 budget left → drop one step
  assert.equal(chooseEffort('complex', 'low', 0.2), 'standard')
  assert.equal(chooseEffort('medium', 'low', 0.2), 'quick')
  // quick is the floor — cannot go below
  assert.equal(chooseEffort('simple', 'low', 0.05), 'quick')
})

test('chooseEffort: down-scale and risk-bump compose (net zero on complex+high+low budget)', () => {
  // complex→ultra, +high→ultra(capped), low budget −1 → standard
  assert.equal(chooseEffort('complex', 'high', 0.2), 'standard')
})

test('chooseEffort: unknown complexity defaults to standard, still budget-clamped', () => {
  assert.equal(chooseEffort('bogus', 'low', 1.0), 'standard')
  assert.equal(chooseEffort('bogus', 'low', 0.1), 'quick')
})
