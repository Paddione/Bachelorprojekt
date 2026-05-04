// dashboard/web/test/kubectl.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRequest } = require('../lib/kubectl');

test('accepts allowlisted get for pods in workspace', () => {
  assert.equal(validateRequest({ context: 'mentolder', verb: 'get', resource: 'pods', namespace: 'workspace' }).ok, true);
});

test('rejects unknown verb', () => {
  const r = validateRequest({ context: 'mentolder', verb: 'delete', resource: 'pods', namespace: 'workspace' });
  assert.equal(r.ok, false);
  assert.match(r.error, /verb/i);
});

test('rejects unknown resource', () => {
  assert.equal(validateRequest({ context: 'mentolder', verb: 'get', resource: 'secrets', namespace: 'workspace' }).ok, false);
});

test('rejects unknown namespace', () => {
  assert.equal(validateRequest({ context: 'mentolder', verb: 'get', resource: 'pods', namespace: 'kube-system' }).ok, false);
});

test('rejects unknown context', () => {
  assert.equal(validateRequest({ context: 'pirate', verb: 'get', resource: 'pods', namespace: 'workspace' }).ok, false);
});

test('rejects shell metacharacter in name', () => {
  assert.equal(validateRequest({ context: 'mentolder', verb: 'logs', resource: 'pods', namespace: 'workspace', name: 'foo;rm -rf /' }).ok, false);
});

test('accepts a normal pod name for logs', () => {
  assert.equal(validateRequest({ context: 'mentolder', verb: 'logs', resource: 'pods', namespace: 'workspace', name: 'website-7c4f6b8d9-abcde' }).ok, true);
});
