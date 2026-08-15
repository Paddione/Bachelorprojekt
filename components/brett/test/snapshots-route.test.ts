import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildSnapshotListQuery,
  parseSnapshotInsert,
  canCreateTemplate,
  // SEC bug #2 (T000660): the session guard the unauthenticated read/write
  // snapshot routes (GET /api/snapshots/:id, POST /api/snapshots) must use.
  // Not yet implemented — undefined until the guard exists.
  requireSession,
} from '../src/server/index';

function reqWith(opts: { isAdmin?: boolean; e2eHeader?: string }): any {
  return {
    session: opts.isAdmin ? { isAdmin: true } : undefined,
    header: (n: string) => (n === 'x-e2e-secret' ? opts.e2eHeader : undefined),
  };
}

// D8 — Pure helpers behind GET/POST /api/snapshots, extended for is_template.

test('buildSnapshotListQuery: isTemplate-only is a valid standalone filter', () => {
  const { sql, args } = buildSnapshotListQuery({ isTemplate: true });
  assert.match(sql, /is_template/, 'SELECT must list is_template');
  assert.match(sql, /WHERE\s+is_template\s*=\s*true/i, 'WHERE must filter is_template = true');
  // No room/customer required — today the route 400s without one.
  assert.ok(!/room_token|customer_id/.test(sql.replace(/SELECT[\s\S]*?FROM/i, '')), 'no room/customer filter needed');
  assert.deepStrictEqual(args, []);
});

test('buildSnapshotListQuery: room filter still works', () => {
  const { sql, args } = buildSnapshotListQuery({ room: 'r1' });
  assert.match(sql, /room_token = \$1/);
  assert.deepStrictEqual(args, ['r1']);
});

test('buildSnapshotListQuery: customerId + isTemplate combine', () => {
  const { sql, args } = buildSnapshotListQuery({ customerId: 'c1', isTemplate: true });
  assert.match(sql, /customer_id = \$1/);
  assert.match(sql, /is_template = true/i);
  assert.deepStrictEqual(args, ['c1']);
});

test('parseSnapshotInsert: valid with is_template true', () => {
  const r = parseSnapshotInsert({ name: 'T', state: { figures: [] }, is_template: true });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.values?.is_template, true);
  assert.strictEqual(r.values?.name, 'T');
});

test('parseSnapshotInsert: is_template defaults to false when omitted', () => {
  const r = parseSnapshotInsert({ name: 'T', state: { figures: [] } });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.values?.is_template, false);
});

test('parseSnapshotInsert: missing name or state.figures → invalid', () => {
  assert.strictEqual(parseSnapshotInsert({ state: { figures: [] } }).valid, false);
  assert.strictEqual(parseSnapshotInsert({ name: 'T', state: {} }).valid, false);
  assert.strictEqual(parseSnapshotInsert({ name: 'T' }).valid, false);
});

// ── SEC-2 — is_template admin gate (the actual route 403 logic) ──────────────
test('SEC-2: canCreateTemplate REJECTS a non-admin request without x-e2e-secret', () => {
  const prev = process.env.BRETT_OIDC_SECRET;
  process.env.BRETT_OIDC_SECRET = 'real-secret';
  try {
    // (1) no admin session, no/incorrect x-e2e-secret → false (route returns 403)
    assert.strictEqual(canCreateTemplate(reqWith({})), false, 'no admin + no header → forbidden');
    assert.strictEqual(canCreateTemplate(reqWith({ e2eHeader: 'wrong' })), false, 'wrong header → forbidden');
  } finally {
    if (prev === undefined) delete process.env.BRETT_OIDC_SECRET; else process.env.BRETT_OIDC_SECRET = prev;
  }
});

test('SEC-2: canCreateTemplate ALLOWS an admin session', () => {
  assert.strictEqual(canCreateTemplate(reqWith({ isAdmin: true })), true);
});

test('SEC-2: canCreateTemplate ALLOWS the correct x-e2e-secret', () => {
  const prev = process.env.BRETT_OIDC_SECRET;
  process.env.BRETT_OIDC_SECRET = 'real-secret';
  try {
    assert.strictEqual(canCreateTemplate(reqWith({ e2eHeader: 'real-secret' })), true);
  } finally {
    if (prev === undefined) delete process.env.BRETT_OIDC_SECRET; else process.env.BRETT_OIDC_SECRET = prev;
  }
});

// ── SEC bug #2 (T000660): unauthenticated snapshot read/write must be gated ──
// GET /api/snapshots/:id and POST /api/snapshots (non-template) carried no
// session check. The same requireSession guard exported from index must 401
// anonymous callers and admit a real session.
test('SEC bug #2: requireSession is exported and is a function', () => {
  assert.strictEqual(typeof requireSession, 'function');
});

test('SEC bug #2: requireSession 401s an anonymous snapshot request', () => {
  const res: any = { code: 0 };
  res.status = (c: number) => { res.code = c; return res; };
  res.json = () => res;
  const prev = process.env.BRETT_OIDC_SECRET;
  delete process.env.BRETT_OIDC_SECRET;
  let nextCalled = false;
  requireSession({ session: {}, header: () => undefined } as any, res, () => { nextCalled = true; });
  if (prev !== undefined) process.env.BRETT_OIDC_SECRET = prev;
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.code, 401);
});

test('SEC bug #2: requireSession admits an authenticated session', () => {
  let passed = false;
  requireSession(
    { session: { userId: 'u1' }, header: () => undefined } as any,
    { status: () => ({ json: () => {} }) } as any,
    () => { passed = true; },
  );
  assert.strictEqual(passed, true);
});

test('SEC-2: with no BRETT_OIDC_SECRET set, the x-e2e bypass is closed', () => {
  const prev = process.env.BRETT_OIDC_SECRET;
  delete process.env.BRETT_OIDC_SECRET;
  try {
    assert.strictEqual(canCreateTemplate(reqWith({ e2eHeader: '' })), false);
    assert.strictEqual(canCreateTemplate(reqWith({ e2eHeader: 'anything' })), false);
  } finally {
    if (prev !== undefined) process.env.BRETT_OIDC_SECRET = prev;
  }
});
