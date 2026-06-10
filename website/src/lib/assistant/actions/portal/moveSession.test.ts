import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetClientBookings, mockUpdateCalendarEventTime, mockSendRescheduleNotification, mockGetCustomerByKeycloakId } =
  vi.hoisted(() => ({
    mockGetClientBookings: vi.fn(),
    mockUpdateCalendarEventTime: vi.fn(),
    mockSendRescheduleNotification: vi.fn().mockResolvedValue(true),
    mockGetCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
  }));

vi.mock('../../../../caldav.js', () => ({
  getClientBookings: mockGetClientBookings,
  updateCalendarEventTime: mockUpdateCalendarEventTime,
}));
vi.mock('../../../../email.js', () => ({
  sendRescheduleNotification: mockSendRescheduleNotification,
}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: mockGetCustomerByKeycloakId,
}));

import './moveSession.js';
import { executeAction } from '../../actions.js';

beforeEach(() => {
  mockGetClientBookings.mockReset();
  mockUpdateCalendarEventTime.mockReset();
  mockSendRescheduleNotification.mockReset().mockResolvedValue(true);
  mockGetCustomerByKeycloakId.mockReset().mockResolvedValue(null);
});

describe('moveSession handler', () => {
  it('returns ok:false when uid or newDatetime missing', async () => {
    const r = await executeAction('portal:move-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });
    expect(r.ok).toBe(false);
  });

  it('returns ok:false when booking not owned by customer', async () => {
    mockGetClientBookings.mockResolvedValue([]);

    const r = await executeAction('portal:move-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'abc-123', newDatetime: '2026-07-02T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gefunden|Berechtigung/i);
  });

  it('calls updateCalendarEventTime and returns ok:true', async () => {
    mockGetClientBookings.mockResolvedValue([
      { uid: 'abc-123', summary: 'Termin', start: new Date(), end: new Date(), status: 'CONFIRMED' },
    ]);
    mockUpdateCalendarEventTime.mockResolvedValue(true);

    const r = await executeAction('portal:move-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'abc-123', newDatetime: '2026-07-02T10:00:00Z', durationMin: 60 },
    });
    expect(r.ok).toBe(true);
    expect(mockUpdateCalendarEventTime).toHaveBeenCalledWith(
      'abc-123',
      expect.any(Date),
      expect.any(Date),
    );
  });
});
