import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createViewerToken, createPublisherToken } from './livekit-token.ts';

describe('createViewerToken', () => {
  it('returns a JWT string', async () => {
    const token = await createViewerToken('user-123', 'Test User', 'devlivekit', 'devlivekitsecret1234567890abcdef');
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 20);
  });
});

describe('createPublisherToken', () => {
  it('returns a JWT string', async () => {
    const token = await createPublisherToken('admin-1', 'Admin', 'devlivekit', 'devlivekitsecret1234567890abcdef');
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 20);
  });
});
