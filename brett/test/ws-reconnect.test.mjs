import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffSequence } from '../public/assets/ws.mjs';

test('backoff: 1s, 2s, 4s, 8s, 16s, 30s cap', () => {
  const seq = [];
  for (let i = 0; i < 8; i++) seq.push(backoffSequence(i));
  assert.deepEqual(seq, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});
