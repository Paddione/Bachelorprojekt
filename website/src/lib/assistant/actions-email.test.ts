import { describe, it, expect, vi } from 'vitest';

vi.mock('../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue({
    id: 'cust-1',
    email: 'test@example.com',
    name: 'Test Kunde',
  }),
}));

describe('executeAction — email middleware', () => {
  it('fills ctx.email from getCustomerByKeycloakId before calling handler', async () => {
    const { registerAction, executeAction } = await import('./actions.js');

    let capturedEmail: string | undefined;
    registerAction({
      id: 'test:email-capture',
      allowedProfiles: ['portal'],
      describe: () => ({ targetLabel: 't', summary: 't' }),
      handler: async (ctx) => {
        capturedEmail = ctx.email;
        return { ok: true, message: 'ok' };
      },
    });

    await executeAction('test:email-capture', {
      profile: 'portal',
      userSub: 'keycloak-sub-xyz',
      payload: {},
    });

    expect(capturedEmail).toBe('test@example.com');
  });

  it('leaves email undefined when getCustomerByKeycloakId returns null', async () => {
    vi.mocked((await import('../website-db.js')).getCustomerByKeycloakId).mockResolvedValue(null);

    const { registerAction, executeAction } = await import('./actions.js');

    let capturedEmail: string | undefined = 'SET';
    registerAction({
      id: 'test:email-null',
      allowedProfiles: ['portal'],
      describe: () => ({ targetLabel: 't', summary: 't' }),
      handler: async (ctx) => {
        capturedEmail = ctx.email;
        return { ok: true, message: 'ok' };
      },
    });

    await executeAction('test:email-null', {
      profile: 'portal',
      userSub: 'sub-unknown',
      payload: {},
    });

    expect(capturedEmail).toBeUndefined();
  });
});
