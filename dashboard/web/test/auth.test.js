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

test('buildAdminGuard prefers x-auth-request-preferred-username over x-auth-request-user', () => {
  // Real Keycloak setup: x-auth-request-user is the sub UUID, the
  // human-readable username is in x-auth-request-preferred-username.
  const guard = buildAdminGuard('alice,bob');
  const req = {
    path: '/api/k8s/pods',
    headers: {
      'x-auth-request-user': 'caf40515-52b3-44c6-aa64-4416f75e1ede',
      'x-auth-request-preferred-username': 'alice',
    },
  };
  const res = mockRes();
  let called = false;
  guard(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.adminUser, 'alice');
});

test('buildAdminGuard rejects when only sub UUID is present and not allowlisted', () => {
  const guard = buildAdminGuard('alice,bob');
  const req = { path: '/', headers: { 'x-auth-request-user': 'caf40515-52b3-44c6-aa64-4416f75e1ede' } };
  const res = mockRes();
  guard(req, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
});

test('buildAdminGuard accepts email as fallback when listed', () => {
  // Allows the operator to seed the allowlist with an email instead of a
  // username — useful when oauth2-proxy isn't passing preferred_username.
  const guard = buildAdminGuard('paddione,patrick@korczewski.de');
  const req = {
    path: '/',
    headers: {
      'x-auth-request-user': 'caf40515-52b3-44c6-aa64-4416f75e1ede',
      'x-auth-request-email': 'patrick@korczewski.de',
    },
  };
  const res = mockRes();
  let called = false;
  guard(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.adminUser, 'patrick@korczewski.de');
});

function mockRes() {
  return {
    statusCode: 200,
    body: '',
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = String(body); return this; },
  };
}
