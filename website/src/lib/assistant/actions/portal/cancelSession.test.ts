import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetClientBookings, mockDeleteCalendarEvent, mockSendCancellationNotification, mockGetCustomerByKeycloakId } =
  vi.hoisted(() => ({
    mockGetClientBookings: vi.fn(),
    mockDeleteCalendarEvent: vi.fn(),
    mockSendCancellationNotification: vi.fn().mockResolvedValue(true),
    mockGetCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
  }));

vi.mock('../../../caldav', () => ({
  getClientBookings: mockGetClientBookings,
  deleteCalendarEvent: mockDeleteCalendarEvent,
}));
vi.mock('../../../email', () => ({
  sendCancellationNotification: mockSendCancellationNotification,
}));
vi.mock('../../../website-db', () => ({
  getCustomerByKeycloakId: mockGetCustomerByKeycloakId,
}));

import './cancelSession';
import { executeAction } from '../../actions';

beforeEach(() => {
  mockGetClientBookings.mockReset();
  mockDeleteCalendarEvent.mockReset();
  mockSendCancellationNotification.mockReset().mockResolvedValue(true);
  mockGetCustomerByKeycloakId.mockReset().mockResolvedValue(null);
});

describe('cancelSession handler', () => {
  it('returns ok:false when uid missing', async () => {
    const r = await executeAction('portal:cancel-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/UID/i);
  });

  it('returns ok:false when uid not in customer bookings (ownership guard)', async () => {
    mockGetClientBookings.mockResolvedValue([
      { uid: 'other-uid', summary: 'Termin', start: new Date(), end: new Date(), status: 'CONFIRMED' },
    ]);

    const r = await executeAction('portal:cancel-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'wrong-uid' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gefunden|Berechtigung/i);
  });

  it('deletes event and returns ok:true when uid matches', async () => {
    const bookingStart = new Date('2026-07-01T09:00:00Z');
    mockGetClientBookings.mockResolvedValue([
      { uid: 'abc-123@Workspace', summary: 'Termin', start: bookingStart, end: new Date(), status: 'CONFIRMED' },
    ]);
    mockDeleteCalendarEvent.mockResolvedValue(true);

    const r = await executeAction('portal:cancel-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'abc-123@Workspace' },
    });
    expect(r.ok).toBe(true);
    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith('abc-123@Workspace');
  });
});
