import { describe, expect, it } from 'vitest';

describe('GitHub identity store contract', () => {
  it('exposes the transactional identity operations', async () => {
    const store = await import('./github-identity-store.ts');
    expect(store.registerGitHubObject).toBeTypeOf('function');
    expect(store.transferGitHubObject).toBeTypeOf('function');
    expect(store.correctCanonicalWorkItem).toBeTypeOf('function');
  });
});
