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
