// Direct-import unit tests for the extracted auth module (TS refactor coverage, A3).
// Tests the module by its public contract instead of transitively through server.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdminFromClaims,
  resolveBrand,
  buildConfig,
  boardAuthRedirect,
  requireAdmin,
  // SEC: open-redirect sanitizer for the OIDC `returnTo` param (T000660 bug #1).
  // Not yet implemented — these imports fail (undefined) until it exists.
  sanitizeReturnTo,
  // SEC: session-guard for unauthenticated read/write API routes (T000660 bug #2).
  requireSession,
} from '../src/server/auth';

test('isAdminFromClaims: true only when realm_access.roles includes "admin"', () => {
  assert.equal(isAdminFromClaims({ realm_access: { roles: ['user', 'admin'] } }), true);
  assert.equal(isAdminFromClaims({ realm_access: { roles: ['user'] } }), false);
  assert.equal(isAdminFromClaims({ realm_access: { roles: [] } }), false);
  assert.equal(isAdminFromClaims({}), false);
  assert.equal(isAdminFromClaims(null), false);
});

test('resolveBrand: env override, else mentolder default', () => {
  assert.equal(resolveBrand({ BRETT_BRAND: 'korczewski' } as any), 'korczewski');
  assert.equal(resolveBrand({} as any), 'mentolder');
});

test('buildConfig: returns an object (stable contract)', () => {
  assert.deepEqual(buildConfig({} as any), {});
});

test('boardAuthRedirect: null when authenticated, login redirect otherwise', () => {
  // Active session → no redirect.
  assert.equal(boardAuthRedirect({ session: { userId: 'u1' } }, {} as any), null);
  // E2E secret header bypass.
  const e2eReq = {
    session: {},
    header: (h: string) => (h === 'x-e2e-secret' ? 'sek' : undefined),
    path: '/board',
  };
  assert.equal(boardAuthRedirect(e2eReq, { BRETT_OIDC_SECRET: 'sek' } as any), null);
  // Unauthenticated → login redirect with URL-encoded returnTo.
  assert.equal(
    boardAuthRedirect({ session: {}, path: '/a b' }, {} as any),
    '/auth/login?returnTo=%2Fa%20b',
  );
});

// ── SEC bug #1 (T000660): open redirect in /auth/callback ────────────────────
// index.ts:118 reads `returnTo` from the OIDC state blob and feeds it straight
// into res.redirect(). A sanitizer must reject anything that isn't a same-site
// relative path (absolute URLs, protocol-relative `//evil`, scheme-bearing).
test('sanitizeReturnTo: allows simple relative paths', () => {
  assert.equal(sanitizeReturnTo('/'), '/');
  assert.equal(sanitizeReturnTo('/board'), '/board');
  assert.equal(sanitizeReturnTo('/board?room=abc'), '/board?room=abc');
});

test('sanitizeReturnTo: rejects absolute / protocol-relative / scheme URLs → "/"', () => {
  assert.equal(sanitizeReturnTo('https://evil.example/phish'), '/', 'absolute https');
  assert.equal(sanitizeReturnTo('http://evil.example'), '/', 'absolute http');
  assert.equal(sanitizeReturnTo('//evil.example'), '/', 'protocol-relative');
  assert.equal(sanitizeReturnTo('javascript:alert(1)'), '/', 'javascript scheme');
  assert.equal(sanitizeReturnTo('/\\evil.example'), '/', 'backslash trick');
});

test('sanitizeReturnTo: non-string / empty → "/"', () => {
  assert.equal(sanitizeReturnTo(''), '/');
  assert.equal(sanitizeReturnTo('relative-no-slash'), '/', 'must start with a single slash');
  assert.equal(sanitizeReturnTo(undefined as any), '/');
  assert.equal(sanitizeReturnTo(null as any), '/');
});

// ── SEC bug #2 (T000660): missing session gate on read/write API routes ──────
// GET /api/state, GET /api/snapshots/:id, POST /api/snapshots (non-template) had
// no auth check. A `requireSession` guard must 401 unauthenticated requests and
// call next() for a session that carries a userId.
test('requireSession: next() for an authenticated session', () => {
  let passed = false;
  requireSession(
    { session: { userId: 'u1' }, header: () => undefined } as any,
    { status: () => ({ json: () => {} }) } as any,
    () => { passed = true; },
  );
  assert.equal(passed, true);
});

test('requireSession: 401 for an unauthenticated request', () => {
  const res: any = { code: 0, body: null };
  res.status = (c: number) => { res.code = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  const prev = process.env.BRETT_OIDC_SECRET;
  delete process.env.BRETT_OIDC_SECRET; // no e2e bypass
  let nextCalled = false;
  requireSession(
    { session: {}, header: () => undefined } as any,
    res,
    () => { nextCalled = true; },
  );
  if (prev !== undefined) process.env.BRETT_OIDC_SECRET = prev;
  assert.equal(nextCalled, false);
  assert.equal(res.code, 401);
});

test('requireAdmin: next() for admin session, 403 otherwise', () => {
  const mkRes = () => {
    const res: any = { code: 0, body: null };
    res.status = (c: number) => { res.code = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    return res;
  };

  let adminPassed = false;
  requireAdmin(
    { session: { isAdmin: true }, header: () => undefined } as any,
    mkRes(),
    () => { adminPassed = true; },
  );
  assert.equal(adminPassed, true);

  const prev = process.env.BRETT_OIDC_SECRET;
  delete process.env.BRETT_OIDC_SECRET; // ensure no e2e-secret bypass
  const res = mkRes();
  let nextCalled = false;
  requireAdmin(
    { session: {}, header: () => undefined } as any,
    res,
    () => { nextCalled = true; },
  );
  if (prev !== undefined) process.env.BRETT_OIDC_SECRET = prev;

  assert.equal(nextCalled, false);
  assert.equal(res.code, 403);
  assert.deepEqual(res.body, { error: 'forbidden' });
});
