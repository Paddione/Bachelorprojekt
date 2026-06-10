import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateInboxItem, mockGetCustomerByKeycloakId } =
  vi.hoisted(() => ({
    mockCreateInboxItem: vi.fn().mockResolvedValue({ id: 42 }),
    mockGetCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
  }));

vi.mock('../../../messaging-db', () => ({
  createInboxItem: mockCreateInboxItem,
}));
vi.mock('../../../website-db', () => ({
  getCustomerByKeycloakId: mockGetCustomerByKeycloakId,
}));

import './requestSession';
import { executeAction } from '../../actions';

beforeEach(() => {
  mockCreateInboxItem.mockReset().mockResolvedValue({ id: 42 });
  mockGetCustomerByKeycloakId.mockReset().mockResolvedValue(null);
});

describe('requestSession handler', () => {
  it('creates an InboxItem with type booking', async () => {
    const r = await executeAction('portal:request-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { message: 'Hätte gerne einen Termin nächste Woche' },
    });

    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Terminanfrage|benachrichtigt/i);
    expect(mockCreateInboxItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'booking',
        payload: expect.objectContaining({
          email: 'kunde@example.com',
          message: 'Hätte gerne einen Termin nächste Woche',
        }),
      }),
    );
  });

  it('returns ok:false when InboxItem creation throws', async () => {
    mockCreateInboxItem.mockRejectedValue(new Error('DB down'));

    const r = await executeAction('portal:request-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });

    expect(r.ok).toBe(false);
  });
});
