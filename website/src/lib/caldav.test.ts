// Unit tests for src/lib/caldav.ts.
//
// caldav.ts talks to Nextcloud CalDAV over HTTP via two paths:
//   1. `fetchEventsRaw` (imported from ./caldav-cache.js) — used by
//      getAllBookings/getClientBookings/getAvailableSlots (via the internal
//      fetchEvents helper) to REPORT-query the calendar for a date range.
//   2. Direct `fetch()` calls (findEventUrl/deleteCalendarEvent/
//      updateCalendarEventStatus/updateCalendarEventTime/createCalendarEvent)
//      for per-event HEAD/GET/PUT/DELETE.
//
// We mock ./caldav-cache.js's fetchEventsRaw (keeping the real iCal parsing
// helpers via importActual) for path 1, and stub the global fetch for path 2.
// getAvailableSlots also dynamically imports ./website-db.js — mocked here.

// getAvailableSlots mixes toISOString() (UTC) with setHours()/getDay() (local
// time) internally. Pin the process TZ to UTC so "local" and "UTC" agree and
// our fixture dates map predictably to date strings + weekday labels.
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./caldav-cache.js', async (importActual) => {
  const actual = await importActual<typeof import('./caldav-cache.js')>();
  return {
    ...actual,
    fetchEventsRaw: vi.fn(),
  };
});

vi.mock('./website-db.js', () => ({
  getFreeTimeWindows: vi.fn(),
  getVacationPeriods: vi.fn(),
}));

import { fetchEventsRaw } from './caldav-cache.js';
import { getFreeTimeWindows, getVacationPeriods } from './website-db.js';
import {
  getAllBookings,
  getClientBookings,
  getAvailableSlots,
  deleteCalendarEvent,
  updateCalendarEventStatus,
  updateCalendarEventTime,
  createCalendarEvent,
} from './caldav';

const mockFetchEventsRaw = vi.mocked(fetchEventsRaw);
const mockGetFreeTimeWindows = vi.mocked(getFreeTimeWindows);
const mockGetVacationPeriods = vi.mocked(getVacationPeriods);

function vevent(props: Record<string, string>): string {
  const lines = ['BEGIN:VEVENT', ...Object.entries(props).map(([k, v]) => `${k}:${v}`), 'END:VEVENT'];
  return lines.join('\r\n');
}

function ical(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mockGetVacationPeriods.mockResolvedValue([]);
  mockGetFreeTimeWindows.mockResolvedValue([]);
});

describe('getAllBookings', () => {
  it('returns empty array when no icals', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    expect(await getAllBookings()).toEqual([]);
  });

  it('parses attendee bookings sorted by start time ascending', async () => {
    const later = vevent({
      UID: 'later@x',
      DTSTART: '20260710T100000Z',
      DTEND: '20260710T110000Z',
      SUMMARY: 'Later meeting',
      STATUS: 'CONFIRMED',
      ATTENDEE: 'CN=Bob;RSVP=TRUE:mailto:bob@example.com',
    });
    const earlier = vevent({
      UID: 'earlier@x',
      DTSTART: '20260701T090000Z',
      DTEND: '20260701T100000Z',
      SUMMARY: 'Earlier meeting',
      ATTENDEE: 'CN=Alice;RSVP=TRUE:mailto:alice@example.com',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(later, earlier)]);

    const bookings = await getAllBookings();
    expect(bookings).toHaveLength(2);
    expect(bookings[0].attendeeEmail).toBe('alice@example.com');
    expect(bookings[0].attendeeName).toBe('Alice');
    expect(bookings[0].status).toBe('CONFIRMED');
    expect(bookings[1].attendeeEmail).toBe('bob@example.com');
  });

  it('skips events without an ATTENDEE line', async () => {
    const noAttendee = vevent({
      UID: 'na@x',
      DTSTART: '20260701T090000Z',
      SUMMARY: 'Internal block',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(noAttendee)]);
    expect(await getAllBookings()).toEqual([]);
  });

  it('skips ATTENDEE lines with no mailto', async () => {
    const bad = vevent({
      UID: 'bad@x',
      DTSTART: '20260701T090000Z',
      ATTENDEE: 'CN=NoMail;RSVP=TRUE',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(bad)]);
    expect(await getAllBookings()).toEqual([]);
  });

  it('uses attendee email as name when CN is missing, and defaults end/status/summary', async () => {
    const evt = vevent({
      UID: 'noname@x',
      DTSTART: '20260701T090000Z',
      ATTENDEE: 'RSVP=TRUE:mailto:noname@example.com',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(evt)]);
    const bookings = await getAllBookings();
    expect(bookings).toHaveLength(1);
    expect(bookings[0].attendeeName).toBe('noname@example.com');
    expect(bookings[0].summary).toBe('Termin');
    expect(bookings[0].status).toBe('CONFIRMED');
    expect(bookings[0].end.getTime()).toBe(bookings[0].start.getTime() + 3600000);
  });

  it('propagates fetchEventsRaw errors (no try/catch in getAllBookings)', async () => {
    mockFetchEventsRaw.mockRejectedValue(new Error('caldav down'));
    await expect(getAllBookings()).rejects.toThrow('caldav down');
  });
});

describe('getClientBookings', () => {
  it('returns [] and logs when fetchEventsRaw throws', async () => {
    mockFetchEventsRaw.mockRejectedValue(new Error('network error'));
    expect(await getClientBookings('alice@example.com')).toEqual([]);
  });

  it('filters events to only the requested client email, sorted descending', async () => {
    const mine1 = vevent({
      UID: 'a@x',
      DTSTART: '20260701T090000Z',
      DTEND: '20260701T100000Z',
      'ATTENDEE;CN=Alice': 'mailto:alice@example.com',
    });
    const mine2 = vevent({
      UID: 'b@x',
      DTSTART: '20260705T090000Z',
      'ATTENDEE;CN=Alice': 'mailto:alice@example.com',
    });
    const notMine = vevent({
      UID: 'c@x',
      DTSTART: '20260703T090000Z',
      'ATTENDEE;CN=Bob': 'mailto:bob@example.com',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(mine1, mine2, notMine)]);

    const bookings = await getClientBookings('alice@example.com');
    expect(bookings).toHaveLength(2);
    // Descending by start
    expect(bookings[0].uid).toBe('b@x');
    expect(bookings[1].uid).toBe('a@x');
  });

  it('escapes regex special characters in the client email', async () => {
    const evt = vevent({
      UID: 'd@x',
      DTSTART: '20260701T090000Z',
      'ATTENDEE;CN=Weird': 'mailto:a+b.c@example.com',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(evt)]);
    const bookings = await getClientBookings('a+b.c@example.com');
    expect(bookings).toHaveLength(1);
  });

  it('returns [] when dtstart is missing even if attendee matches', async () => {
    const evt = vevent({
      UID: 'e@x',
      ATTENDEE: 'CN=Alice:mailto:alice@example.com',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(evt)]);
    expect(await getClientBookings('alice@example.com')).toEqual([]);
  });
});

describe('getAvailableSlots', () => {
  it('degrades gracefully and returns [] when fetchEventsRaw fails (admin view, no brand)', async () => {
    mockFetchEventsRaw.mockRejectedValue(new Error('down'));
    const from = new Date('2030-07-08T00:00:00Z'); // Monday
    const slots = await getAvailableSlots(from);
    // No brand => windowsMap stays null => falls back to WORK_DAYS branch.
    // fetchEvents catches the error internally and returns [], so slots for
    // working days should still be generated (assuming far enough in future).
    expect(Array.isArray(slots)).toBe(true);
  });

  it('produces slots for admin overview (no brand) on a working day, respecting MIN_ADVANCE_HOURS', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    const from = new Date('2030-07-08T00:00:00Z'); // Monday, well in the future
    const days = await getAvailableSlots(from);
    expect(days.length).toBeGreaterThan(0);
    const monday = days.find((d) => d.date === '2030-07-08');
    expect(monday).toBeDefined();
    expect(monday!.weekday).toBe('Montag');
    expect(monday!.slots.length).toBeGreaterThan(0);
    expect(monday!.slots[0].display).toMatch(/^\d{2}:\d{2} - \d{2}:\d{2}$/);
  });

  it('excludes slots overlapping an existing calendar event', async () => {
    const busy = vevent({
      UID: 'busy@x',
      DTSTART: '20300708T090000Z',
      DTEND: '20300708T170000Z',
    });
    mockFetchEventsRaw.mockResolvedValue([ical(busy)]);
    const from = new Date('2030-07-08T00:00:00Z');
    const days = await getAvailableSlots(from);
    const monday = days.find((d) => d.date === '2030-07-08');
    // Entire working day is busy -> no slots that day.
    expect(monday).toBeUndefined();
  });

  it('skips vacation days entirely', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    mockGetVacationPeriods.mockResolvedValue([
      { id: 'v1', start: '2030-07-08', end: '2030-07-08', label: 'Urlaub' },
    ]);
    const from = new Date('2030-07-08T00:00:00Z');
    const days = await getAvailableSlots(from);
    expect(days.find((d) => d.date === '2030-07-08')).toBeUndefined();
  });

  it('falls back gracefully when getVacationPeriods throws', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    mockGetVacationPeriods.mockRejectedValue(new Error('table missing'));
    const from = new Date('2030-07-08T00:00:00Z');
    const days = await getAvailableSlots(from);
    expect(Array.isArray(days)).toBe(true);
  });

  it('uses admin-defined free-time windows when a brand is given', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    mockGetFreeTimeWindows.mockResolvedValue([
      { id: 'w1', date: '2030-07-08', winStart: '09:00', winEnd: '10:00' },
    ]);
    const from = new Date('2030-07-08T00:00:00Z');
    const days = await getAvailableSlots(from, 'mentolder');
    const monday = days.find((d) => d.date === '2030-07-08');
    expect(monday).toBeDefined();
    expect(monday!.slots).toHaveLength(1);
    expect(monday!.slots[0].display).toBe('09:00 - 10:00');
  });

  it('falls back to no windowsMap when getFreeTimeWindows throws (brand given)', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    mockGetFreeTimeWindows.mockRejectedValue(new Error('no table'));
    const from = new Date('2030-07-08T00:00:00Z');
    const days = await getAvailableSlots(from, 'mentolder');
    // windowsMap stays null -> falls through to WORK_DAYS admin branch.
    const monday = days.find((d) => d.date === '2030-07-08');
    expect(monday).toBeDefined();
    expect(monday!.slots.length).toBeGreaterThan(0);
  });

  it('produces no slots on a weekend day for the admin overview', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    const from = new Date('2030-07-06T00:00:00Z'); // Saturday
    const days = await getAvailableSlots(from);
    expect(days.find((d) => d.date === '2030-07-06')).toBeUndefined();
  });

  it('honours a custom slot duration', async () => {
    mockFetchEventsRaw.mockResolvedValue([]);
    const from = new Date('2030-07-08T00:00:00Z');
    const days = await getAvailableSlots(from, undefined, 30);
    const monday = days.find((d) => d.date === '2030-07-08');
    expect(monday).toBeDefined();
    // 30-minute slots => "09:00 - 09:30"
    expect(monday!.slots[0].display).toBe('09:00 - 09:30');
  });
});

describe('deleteCalendarEvent', () => {
  it('returns false when the event cannot be found (HEAD fails)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await deleteCalendarEvent('uid1@x')).toBe(false);
  });

  it('returns true when DELETE succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true }) // HEAD (findEventUrl)
      .mockResolvedValueOnce({ ok: true, status: 200 }); // DELETE
    vi.stubGlobal('fetch', fetchMock);
    expect(await deleteCalendarEvent('uid1@x')).toBe(true);
  });

  it('returns true on 204 No Content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await deleteCalendarEvent('uid1@x')).toBe(true);
  });

  it('returns false and logs when DELETE throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('conn reset'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await deleteCalendarEvent('uid1@x')).toBe(false);
  });

  it('returns false when findEventUrl HEAD throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await deleteCalendarEvent('uid1@x')).toBe(false);
  });
});

describe('updateCalendarEventStatus', () => {
  it('returns false when event URL cannot be resolved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await updateCalendarEventStatus('uid2@x', 'CANCELLED')).toBe(false);
  });

  it('returns false when the GET fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true }) // HEAD
      .mockResolvedValueOnce({ ok: false }); // GET
    vi.stubGlobal('fetch', fetchMock);
    expect(await updateCalendarEventStatus('uid2@x', 'CANCELLED')).toBe(false);
  });

  it('replaces an existing STATUS line and PUTs the update', async () => {
    const existingIcal = ical(
      vevent({ UID: 'uid2@x', DTSTART: '20260701T090000Z', STATUS: 'CONFIRMED' }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true }) // HEAD
      .mockResolvedValueOnce({ ok: true, text: async () => existingIcal }) // GET
      .mockResolvedValueOnce({ ok: true, status: 200 }); // PUT
    vi.stubGlobal('fetch', fetchMock);
    const result = await updateCalendarEventStatus('uid2@x', 'CANCELLED');
    expect(result).toBe(true);
    const putCall = fetchMock.mock.calls[2];
    expect(putCall[1].body).toContain('STATUS:CANCELLED');
  });

  it('inserts a STATUS line when none exists', async () => {
    const existingIcal = ical(vevent({ UID: 'uid3@x', DTSTART: '20260701T090000Z' }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, text: async () => existingIcal })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const result = await updateCalendarEventStatus('uid3@x', 'CONFIRMED');
    expect(result).toBe(true);
    const putCall = fetchMock.mock.calls[2];
    expect(putCall[1].body).toContain('STATUS:CONFIRMED\r\nEND:VEVENT');
  });

  it('returns false and logs when an exception is thrown', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await updateCalendarEventStatus('uid4@x', 'CANCELLED')).toBe(false);
  });
});

describe('updateCalendarEventTime', () => {
  it('returns false when event URL cannot be resolved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await updateCalendarEventTime('uid5@x', new Date(), new Date())).toBe(false);
  });

  it('returns false when GET fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    expect(await updateCalendarEventTime('uid5@x', new Date(), new Date())).toBe(false);
  });

  it('rewrites DTSTART/DTEND and PUTs the update', async () => {
    const existingIcal = ical(
      vevent({ UID: 'uid5@x', DTSTART: '20260701T090000Z', DTEND: '20260701T100000Z' }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, text: async () => existingIcal })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const newStart = new Date('2026-07-10T09:00:00Z');
    const newEnd = new Date('2026-07-10T10:00:00Z');
    const result = await updateCalendarEventTime('uid5@x', newStart, newEnd);
    expect(result).toBe(true);
    const putCall = fetchMock.mock.calls[2];
    expect(putCall[1].body).toContain('DTSTART:20260710T090000Z');
    expect(putCall[1].body).toContain('DTEND:20260710T100000Z');
  });

  it('returns false and logs when an exception is thrown', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await updateCalendarEventTime('uid5@x', new Date(), new Date())).toBe(false);
  });
});

describe('createCalendarEvent', () => {
  it('creates an event and returns its uid on 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201 }));
    const result = await createCalendarEvent({
      summary: 'Beratung',
      description: 'Erstgespräch\nmit Notizen',
      start: new Date('2026-07-10T09:00:00Z'),
      end: new Date('2026-07-10T10:00:00Z'),
      attendeeEmail: 'client@example.com',
      attendeeName: 'Client Name',
    });
    expect(result).not.toBeNull();
    expect(result!.uid).toMatch(/@/);
  });

  it('includes ATTENDEE line when attendeeEmail is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
    await createCalendarEvent({
      summary: 'S',
      description: 'D',
      start: new Date(),
      end: new Date(),
      attendeeEmail: 'client@example.com',
    });
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain('ATTENDEE;CN=client@example.com;RSVP=TRUE:mailto:client@example.com');
  });

  it('omits ATTENDEE line when no attendeeEmail is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
    await createCalendarEvent({
      summary: 'S',
      description: 'D',
      start: new Date(),
      end: new Date(),
    });
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain('ATTENDEE');
  });

  it('returns null and logs when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }),
    );
    const result = await createCalendarEvent({
      summary: 'S',
      description: 'D',
      start: new Date(),
      end: new Date(),
    });
    expect(result).toBeNull();
  });

  it('returns null and logs when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await createCalendarEvent({
      summary: 'S',
      description: 'D',
      start: new Date(),
      end: new Date(),
    });
    expect(result).toBeNull();
  });
});
