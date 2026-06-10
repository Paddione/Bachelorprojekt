import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateCalendarEvent, mockSendBookingConfirmation, mockGetCustomerByKeycloakId } =
  vi.hoisted(() => ({
    mockCreateCalendarEvent: vi.fn(),
    mockSendBookingConfirmation: vi.fn().mockResolvedValue(true),
    mockGetCustomerByKeycloakId: vi.fn().mockResolvedValue({
      id: 'c1',
      email: 'kunde@example.com',
      name: 'Max Muster',
    }),
  }));

vi.mock('../../../../caldav.js', () => ({
  createCalendarEvent: mockCreateCalendarEvent,
}));
vi.mock('../../../../email.js', () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: mockGetCustomerByKeycloakId,
}));

// Register the action via side-effect import (top-level, runs once)
import './bookSession.js';
import { executeAction } from '../../actions.js';

beforeEach(() => {
  mockCreateCalendarEvent.mockReset();
  mockSendBookingConfirmation.mockReset().mockResolvedValue(true);
  mockGetCustomerByKeycloakId.mockReset().mockResolvedValue({
    id: 'c1',
    email: 'kunde@example.com',
    name: 'Max Muster',
  });
});

describe('bookSession handler', () => {
  it('returns ok:false when email missing in context', async () => {
    // userSub is empty so middleware won't look up customer → email stays undefined
    mockGetCustomerByKeycloakId.mockResolvedValue(null);
    const result = await executeAction('portal:book-session', {
      profile: 'portal',
      userSub: '',
      email: undefined,
      payload: { datetime: '2026-07-01T09:00:00Z' },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/E-Mail/i);
  });

  it('returns ok:false when datetime missing', async () => {
    const result = await executeAction('portal:book-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });
    expect(result.ok).toBe(false);
  });

  it('calls createCalendarEvent and returns ok:true', async () => {
    mockCreateCalendarEvent.mockResolvedValue({ uid: 'new-uid@Workspace' });

    const result = await executeAction('portal:book-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { datetime: '2026-07-01T09:00:00.000Z', durationMin: 60 },
    });
    expect(result.ok).toBe(true);
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeEmail: 'kunde@example.com' }),
    );
  });
});
