import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldConnectAuxWs } from '../public/assets/coaching/ws-gate.mjs';

test('aux ws.mjs connection only runs in mayhem mode', () => {
  assert.equal(shouldConnectAuxWs('mayhem'), true);
  assert.equal(shouldConnectAuxWs('coaching'), false);
  assert.equal(shouldConnectAuxWs('mode-select'), false);
  assert.equal(shouldConnectAuxWs(undefined), false);
});
