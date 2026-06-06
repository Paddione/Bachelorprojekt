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
