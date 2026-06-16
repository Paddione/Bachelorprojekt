import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideDeployTransition } from './deploy-transition.mjs';

describe('decideDeployTransition', () => {
  it('website tickets advance straight to done (rollout = deploy)', () => {
    assert.equal(decideDeployTransition({ isWebsite: true, deployOutput: 'PR merged' }).status, 'done');
  });
  it('push-based tickets stop at awaiting_deploy', () => {
    assert.equal(decideDeployTransition({ isWebsite: false, deployOutput: 'PR merged' }).status, 'awaiting_deploy');
  });
  it('blocked deploy output stays blocked', () => {
    const r = decideDeployTransition({ isWebsite: false, deployOutput: 'BLOCK: deploy-guard' });
    assert.equal(r.status, 'blocked');
  });
});
