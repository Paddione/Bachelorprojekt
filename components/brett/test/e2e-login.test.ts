// brett/test/e2e-login.test.ts — Phase C / C7
// Offline guard for the parameterized /auth/e2e-login identity resolution so the
// observer-gate E2E can mint two DISTINCT identities.
import { test } from 'node:test';
import assert from 'node:assert';
import { resolveE2eIdentity } from '../src/server/index';

test('resolveE2eIdentity: defaults to the historical single admin', () => {
  assert.deepStrictEqual(resolveE2eIdentity(undefined), { userId: 'e2e-admin', name: 'E2E Admin', isAdmin: true });
  assert.deepStrictEqual(resolveE2eIdentity({}), { userId: 'e2e-admin', name: 'E2E Admin', isAdmin: true });
});

test('resolveE2eIdentity: honors a distinct userId/name (two-context support)', () => {
  assert.deepStrictEqual(
    resolveE2eIdentity({ userId: 'beob-e2e', name: 'Beobachter' }),
    { userId: 'beob-e2e', name: 'Beobachter', isAdmin: true },
  );
});

test('resolveE2eIdentity: isAdmin defaults true, only explicit false demotes', () => {
  assert.strictEqual(resolveE2eIdentity({ userId: 'x' }).isAdmin, true);
  assert.strictEqual(resolveE2eIdentity({ userId: 'x', isAdmin: false }).isAdmin, false);
  assert.strictEqual(resolveE2eIdentity({ userId: 'x', isAdmin: true }).isAdmin, true);
});

test('resolveE2eIdentity: ignores non-string userId/name', () => {
  const r = resolveE2eIdentity({ userId: 123, name: {} });
  assert.strictEqual(r.userId, 'e2e-admin');
  assert.strictEqual(r.name, 'E2E Admin');
});
