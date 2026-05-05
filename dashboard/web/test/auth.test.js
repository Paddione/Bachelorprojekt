// dashboard/web/test/auth.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminGuard } = require('../lib/auth');

test('buildAdminGuard rejects when X-Auth-Request-User header missing', () => {
  const guard = buildAdminGuard('alice,bob');
  const req = { headers: {} };
  const res = mockRes();
  guard(req, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
});

test('buildAdminGuard rejects when user is not in allowlist', () => {
  const guard = buildAdminGuard('alice,bob');
  const req = { headers: { 'x-auth-request-user': 'eve' } };
  const res = mockRes();
  guard(req, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
});

test('buildAdminGuard calls next when user is in allowlist', () => {
  const guard = buildAdminGuard('alice,bob');
  const req = { headers: { 'x-auth-request-user': 'bob' } };
  const res = mockRes();
  let called = false;
  guard(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.adminUser, 'bob');
});

test('buildAdminGuard handles whitespace and empty entries', () => {
  const guard = buildAdminGuard(' alice , , bob ,');
  const req = { headers: { 'x-auth-request-user': 'alice' } };
  const res = mockRes();
  let called = false;
  guard(req, res, () => { called = true; });
  assert.equal(called, true);
});

function mockRes() {
  return {
    statusCode: 200,
    body: '',
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = String(body); return this; },
  };
}
