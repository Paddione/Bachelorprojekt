import { describe, it, expect } from 'vitest';
import { registerAction, executeAction, listActionsFor } from './actions';

describe('action registry', () => {
  it('registers and executes a profile-allowed action', async () => {
    registerAction({
      id: 'test:noop',
      allowedProfiles: ['admin'],
      describe: () => ({ targetLabel: 'noop', summary: 'tut nichts' }),
      handler: async () => ({ ok: true, message: 'ok' }),
    });
    const r = await executeAction('test:noop', { profile: 'admin', userSub: 'u', payload: {} });
    expect(r.ok).toBe(true);
  });

  it('rejects an action that is not on the profile whitelist', async () => {
    registerAction({
      id: 'test:admin-only',
      allowedProfiles: ['admin'],
      describe: () => ({ targetLabel: 'x', summary: 'x' }),
      handler: async () => ({ ok: true, message: 'ok' }),
    });
    await expect(
      executeAction('test:admin-only', { profile: 'portal', userSub: 'u', payload: {} })
    ).rejects.toThrow(/not allowed/);
  });

  it('rejects an unknown action id', async () => {
    await expect(
      executeAction('test:does-not-exist', { profile: 'admin', userSub: 'u', payload: {} })
    ).rejects.toThrow(/unknown action/);
  });

  it('lists only actions allowed for a given profile', () => {
    const adminIds = listActionsFor('admin').map((a) => a.id);
    const portalIds = listActionsFor('portal').map((a) => a.id);
    expect(adminIds).toContain('test:admin-only');
    expect(portalIds).not.toContain('test:admin-only');
  });
});
