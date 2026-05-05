import { describe, it, expect } from 'vitest';
import { createViewerToken, createPublisherToken } from './livekit-token';

describe('createViewerToken', () => {
  it('returns a JWT string', async () => {
    const token = await createViewerToken('user-123', 'Test User', 'devlivekit', 'devlivekitsecret1234567890abcdef');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });
});

describe('createPublisherToken', () => {
  it('returns a JWT string', async () => {
    const token = await createPublisherToken('admin-1', 'Admin', 'devlivekit', 'devlivekitsecret1234567890abcdef');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });
});
