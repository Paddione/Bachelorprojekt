// brett/test/session-ready-gate.test.ts — Phase B / B13
import { test } from 'node:test';
import assert from 'node:assert';
import { gateSessionReady } from '../src/server/index';

test('gateSessionReady: not ready → false + error:not-ready sent', () => {
  const ws = {};
  const sent: any[] = [];
  const ok = gateSessionReady(ws, (m: any) => sent.push(m));
  assert.strictEqual(ok, false);
  assert.deepStrictEqual(sent, [{ type: 'error', reason: 'not-ready' }]);
});

test('gateSessionReady: ready → true + nothing sent', () => {
  const ws = { _sessionReady: true };
  const sent: any[] = [];
  const ok = gateSessionReady(ws, (m: any) => sent.push(m));
  assert.strictEqual(ok, true);
  assert.strictEqual(sent.length, 0);
});
