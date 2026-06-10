import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
});

describe('updateCalendarEventTime', () => {
  it('returns false when event uid not found (HEAD 404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const { updateCalendarEventTime } = await import('../caldav.js');
    const result = await updateCalendarEventTime(
      'missing-uid',
      new Date('2026-07-02T09:00:00Z'),
      new Date('2026-07-02T10:00:00Z'),
    );
    expect(result).toBe(false);
  });

  it('patches DTSTART and DTEND and PUTs back', async () => {
    const originalIcal = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc-123@Workspace',
      'DTSTART:20260701T090000Z',
      'DTEND:20260701T100000Z',
      'SUMMARY:Termin',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // HEAD (findEventUrl)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => originalIcal }) // GET
      .mockResolvedValueOnce({ ok: true, status: 204 }); // PUT

    const { updateCalendarEventTime } = await import('../caldav.js');
    const result = await updateCalendarEventTime(
      'abc-123@Workspace',
      new Date('2026-07-02T09:00:00Z'),
      new Date('2026-07-02T10:00:00Z'),
    );

    expect(result).toBe(true);
    const [, putOpts] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(putOpts.method).toBe('PUT');
    const putBody = putOpts.body as string;
    expect(putBody).toMatch(/DTSTART:20260702T090000Z/);
    expect(putBody).toMatch(/DTEND:20260702T100000Z/);
  });
});
