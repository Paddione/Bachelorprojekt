import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
});

describe('getClientBookings uid', () => {
  it('includes the uid field in each returned booking', async () => {
    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc-123@Workspace',
      'DTSTART:20260701T090000Z',
      'DTEND:20260701T100000Z',
      'SUMMARY:Termin',
      'STATUS:CONFIRMED',
      'ATTENDEE;CN=Test;RSVP=TRUE:mailto:test@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const xmlBody = `<multistatus xmlns:c="urn:ietf:params:xml:ns:caldav">
      <response><propstat><prop>
        <c:calendar-data>${ical}</c:calendar-data>
      </prop></propstat></response></multistatus>`;

    fetchMock.mockResolvedValue({ ok: true, status: 207, text: async () => xmlBody });

    const { getClientBookings } = await import('../caldav.js');
    const bookings = await getClientBookings('test@example.com');

    expect(bookings).toHaveLength(1);
    expect((bookings[0] as { uid: string }).uid).toBe('abc-123@Workspace');
  });
});
