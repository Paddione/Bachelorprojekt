import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIRoute } from 'astro';

// ---------- hoisted mutable fixtures (usable inside vi.mock factories) ------
const { dbState, whitelistRows } = vi.hoisted(() => ({
  dbState: {
    windows: [] as Array<{ id: string; date: string; winStart: string; winEnd: string }>,
    vacations: [] as Array<{ id: string; start: string; end: string; label: string }>,
    holidays: [] as string[],
    buffers: { preMin: 0, postMin: 0 },
    slotInWindow: true,
    slotReleased: false,
    claimResult: true,
  },
  whitelistRows: new Map<string, string>(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('../tickets-schema', () => ({ initTicketsSchema: vi.fn(async () => undefined) }));

// In-memory slot_whitelist behind the real appointments-db module.
vi.mock('../db-pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params?: Array<string | Date | null>) => {
      if (typeof text === 'string' && text.includes('slot_whitelist') && params && params.length >= 2) {
        const stamp = (value: string | Date | null): string =>
          new Date(value as string | Date).toISOString();
        if (text.trimStart().startsWith('DELETE')) {
          const key = `${String(params[0])}|${stamp(params[1])}`;
          if (whitelistRows.has(key)) {
            whitelistRows.delete(key);
            return { rows: [{ '?column?': 1 }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('INSERT INTO slot_whitelist')) {
          whitelistRows.set(`${String(params[0])}|${stamp(params[1])}`, stamp(params[2]));
          return { rows: [], rowCount: 1 };
        }
        const key = `${String(params[0])}|${stamp(params[1])}`;
        return whitelistRows.has(key)
          ? { rows: [{ '?column?': 1 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
  ensureSchemaOnce: vi.fn(async (_key: string, fn: () => Promise<unknown>) => {
    await fn();
  }),
}));

// CalDAV availability reads windows/vacations through these accessors.
vi.mock('../website-db', () => ({
  getVacationPeriods: vi.fn(async () => dbState.vacations),
  getFreeTimeWindows: vi.fn(async () => dbState.windows),
  isSlotInAnyWindow: vi.fn(async () => dbState.slotInWindow),
  isSlotWhitelisted: vi.fn(async () => dbState.slotReleased),
  claimSlot: vi.fn(async () => dbState.claimResult),
}));

vi.mock('../website-core-db', () => ({
  getHolidays: vi.fn(async () => dbState.holidays),
  getBookingBuffers: vi.fn(async () => dbState.buffers),
}));

vi.mock('../email', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('../notifications', () => ({ sendAdminNotification: vi.fn(async () => undefined) }));
vi.mock('../messaging-db', () => ({ createInboxItem: vi.fn(async () => ({ id: 'inbox-1' })) }));

import { berlinDayKey, berlinWallMinutes, berlinWeekdayIso } from '../caldav-cache.js';
import { getAvailableSlots } from '../caldav.js';
import {
  addSlotToWhitelist,
  claimSlot as claimSlotDb,
} from '../appointments-db.js';
import { POST as bookingPOST } from '../../pages/api/booking.js';
import { createInboxItem } from '../messaging-db.js';
import { getEffectiveLeistungen } from '../content.js';
import massageCatalogue from '../../../../../content/massage/leistungen.json';
import { LeistungenSchema } from '../../content-schema';

const mockedInbox = vi.mocked(createInboxItem);

function emptyReport(): { ok: boolean; status: number; text: () => Promise<string> } {
  return { ok: true, status: 200, text: async () => '<d:multistatus xmlns:d="DAV:"/>' };
}

function reportWithEvents(
  events: Array<{ uid: string; start: string; end: string; summary: string }>,
): { ok: boolean; status: number; text: () => Promise<string> } {
  const datas = events
    .map(
      (e) =>
        `<c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav">BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${e.uid}\r\nDTSTART:${e.start}\r\nDTEND:${e.end}\r\nSUMMARY:${e.summary}\r\nEND:VEVENT\r\nEND:VCALENDAR</c:calendar-data>`,
    )
    .join('');
  return { ok: true, status: 200, text: async () => `<d:multistatus>${datas}</d:multistatus>` };
}

function toIcsBasic(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Berlin UTC offset in minutes measured at local noon (unambiguous across DST). */
function berlinOffsetMinutesAt(dayKey: string): number {
  return berlinWallMinutes(new Date(`${dayKey}T12:00:00Z`)) - 720;
}

function berlinWallToUtcMs(dayKey: string, minutes: number): number {
  return Date.parse(`${dayKey}T00:00:00Z`) + (minutes - berlinOffsetMinutesAt(dayKey)) * 60000;
}

let ipCounter = 0;

async function postBooking(body: Record<string, unknown>): Promise<Response> {
  ipCounter += 1;
  const request = new Request('http://localhost/api/booking', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `10.9.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
  const ctx = {
    request,
    locals: {
      requestLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    },
  } as unknown as Parameters<APIRoute>[0];
  return (await bookingPOST(ctx)) as Response;
}

beforeEach(() => {
  dbState.windows = [];
  dbState.vacations = [];
  dbState.holidays = [];
  dbState.buffers = { preMin: 0, postMin: 0 };
  dbState.slotInWindow = true;
  dbState.slotReleased = false;
  dbState.claimResult = true;
  whitelistRows.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(emptyReport());
  mockedInbox.mockClear();
});

describe('berlin helpers', () => {
  it('derives the Berlin calendar day across the midnight boundary', () => {
    expect(berlinDayKey(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01-15');
    // 23:30 UTC is 00:30 next day in Berlin (CET).
    expect(berlinDayKey(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });

  it('handles the March spring-forward transition (2026-03-29)', () => {
    // 00:30 UTC = 01:30 CET, still standard time.
    expect(berlinDayKey(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    expect(berlinWallMinutes(new Date('2026-03-29T00:30:00Z'))).toBe(90);
    // 01:30 UTC = 03:30 CEST (02:00–03:00 does not exist).
    expect(berlinDayKey(new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
    expect(berlinWallMinutes(new Date('2026-03-29T01:30:00Z'))).toBe(210);
  });

  it('handles the October fall-back transition (2026-10-25)', () => {
    // Both 00:30 UTC (02:30 CEST) and 01:30 UTC (02:30 CET) share the Berlin day.
    expect(berlinDayKey(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25');
    expect(berlinDayKey(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
    expect(berlinWallMinutes(new Date('2026-10-25T01:30:00Z'))).toBe(150);
  });

  it('reports ISO weekdays Monday-first', () => {
    expect(berlinWeekdayIso(new Date('2026-10-08T12:00:00Z'))).toBe(4); // Thursday
    expect(berlinWeekdayIso(new Date('2026-10-11T12:00:00Z'))).toBe(7); // Sunday
    expect(berlinWeekdayIso(new Date('2026-10-12T12:00:00Z'))).toBe(1); // Monday
  });

  it('encodes the lead rule: same-day rejected, next-day allowed', () => {
    const now = new Date();
    const sameDay = new Date(now.getTime() + 3600000);
    const nextDay = new Date(now.getTime() + 36 * 3600000);
    expect(berlinDayKey(sameDay) <= berlinDayKey(now)).toBe(true);
    expect(berlinDayKey(nextDay) > berlinDayKey(now)).toBe(true);
  });
});

describe('claimSlot rivalry', () => {
  it('first claim wins, second claim of the same slot fails', async () => {
    const start = new Date(Date.now() + 86400000);
    await addSlotToWhitelist('mentolder', start, new Date(start.getTime() + 3600000));
    expect(await claimSlotDb('mentolder', start)).toBe(true);
    expect(await claimSlotDb('mentolder', start)).toBe(false);
  });

  it('release after cancellation allows a renewed claim', async () => {
    const start = new Date(Date.now() + 2 * 86400000);
    await addSlotToWhitelist('mentolder', start, new Date(start.getTime() + 3600000));
    expect(await claimSlotDb('mentolder', start)).toBe(true);
    await addSlotToWhitelist('mentolder', start, new Date(start.getTime() + 3600000));
    expect(await claimSlotDb('mentolder', start)).toBe(true);
  });
});

describe('booking route lead time and claim', () => {
  function bookingBody(slotStart: Date, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'Test Person',
      email: 'test@example.test',
      type: 'termin',
      slotStart: slotStart.toISOString(),
      slotEnd: new Date(slotStart.getTime() + 3600000).toISOString(),
      slotDisplay: '10:00 - 11:00',
      date: berlinDayKey(slotStart),
      ...extra,
    };
  }

  /** A slot start guaranteed to fall on today's Berlin calendar day. */
  function sameDaySlot(): Date {
    const now = new Date();
    const shiftMs = berlinWallMinutes(now) > 20 * 60 ? -2 * 3600000 : 2 * 3600000;
    return new Date(now.getTime() + shiftMs);
  }

  it('rejects a same-day request with 409', async () => {
    const res = await postBooking(bookingBody(sameDaySlot()));
    expect(res.status).toBe(409);
    expect(mockedInbox).not.toHaveBeenCalled();
  });

  it('accepts a next-day request with 200', async () => {
    const res = await postBooking(bookingBody(new Date(Date.now() + 36 * 3600000)));
    expect(res.status).toBe(200);
    expect(mockedInbox).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown serviceKey with 400', async () => {
    const res = await postBooking(
      bookingBody(new Date(Date.now() + 36 * 3600000), { serviceKey: 'nope-not-real' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when the atomic claim loses the race', async () => {
    dbState.slotReleased = true;
    dbState.claimResult = false;
    const res = await postBooking(bookingBody(new Date(Date.now() + 36 * 3600000)));
    expect(res.status).toBe(409);
    expect(mockedInbox).not.toHaveBeenCalled();
  });

  it('claims and books a released slot when the atomic claim wins', async () => {
    dbState.slotReleased = true;
    dbState.claimResult = true;
    const res = await postBooking(bookingBody(new Date(Date.now() + 36 * 3600000)));
    expect(res.status).toBe(200);
    expect(mockedInbox).toHaveBeenCalledTimes(1);
  });
});

describe('service snapshot', () => {
  it('freezes price and duration from the catalogue at request time', async () => {
    const cats = await getEffectiveLeistungen();
    const entry = cats.flatMap((c) => c.services)[0];
    const res = await postBooking({
      name: 'Test Person',
      email: 'test@example.test',
      type: 'termin',
      slotStart: new Date(Date.now() + 36 * 3600000).toISOString(),
      slotEnd: new Date(Date.now() + 37 * 3600000).toISOString(),
      serviceKey: entry.key,
    });
    expect(res.status).toBe(200);
    const payload = mockedInbox.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.serviceSnapshot).toEqual({
      key: entry.key,
      name: entry.name,
      price: entry.price,
      durationMin: entry.durationMin ?? null,
    });
  });

  it('embeds an independent copy per request (later changes cannot leak across)', async () => {
    const cats = await getEffectiveLeistungen();
    const key = cats.flatMap((c) => c.services)[0].key;
    const body = {
      name: 'Test Person',
      email: 'test@example.test',
      type: 'termin',
      slotStart: new Date(Date.now() + 36 * 3600000).toISOString(),
      slotEnd: new Date(Date.now() + 37 * 3600000).toISOString(),
      serviceKey: key,
    };
    expect((await postBooking(body)).status).toBe(200);
    const first = mockedInbox.mock.calls[0][0].payload as Record<string, unknown>;
    (first.serviceSnapshot as Record<string, unknown>).price = 'MUTATED';
    expect((await postBooking(body)).status).toBe(200);
    const second = mockedInbox.mock.calls[1][0].payload as Record<string, unknown>;
    expect((second.serviceSnapshot as Record<string, unknown>).price).not.toBe('MUTATED');
  });
});

describe('massage catalogue', () => {
  it('carries the three T901018 template services with placeholder prices', () => {
    const services = massageCatalogue.flatMap((c) => c.services);
    expect(services.map((s) => s.key).sort()).toEqual([
      'ganzkoerper-60',
      'ganzkoerper-90',
      'ruecken-30',
    ]);
    for (const service of services) {
      expect(Number.isInteger(service.durationMin)).toBe(true);
      expect(service.durationMin).toBeGreaterThan(0);
      expect(service.price).toBe('Platzhalter');
      expect(service.price).not.toMatch(/€|\d/);
    }
  });

  it('conforms to the same schema as the bundle leistungen domain', () => {
    expect(() => LeistungenSchema.parse(massageCatalogue)).not.toThrow();
  });
});

describe('getAvailableSlots', () => {
  it('excludes the current Berlin day (lead time) but keeps future workdays', async () => {
    const now = new Date();
    const days = await getAvailableSlots(now, undefined, 60);
    const todayKey = berlinDayKey(now);
    expect(days.some((d) => d.date === todayKey)).toBe(false);
    let expected: string | null = null;
    for (let i = 1; i <= 9; i++) {
      const cand = new Date(now.getTime() + i * 86400000);
      if (berlinDayKey(cand) > todayKey && berlinWeekdayIso(cand) <= 5) {
        expected = berlinDayKey(cand);
        break;
      }
    }
    expect(expected).not.toBeNull();
    expect(days.some((d) => d.date === expected)).toBe(true);
  });

  it('generates window slots in Berlin wall time', async () => {
    const dayKey = berlinDayKey(new Date(Date.now() + 2 * 86400000));
    dbState.windows = [{ id: 'w1', date: dayKey, winStart: '09:00', winEnd: '10:00' }];
    const days = await getAvailableSlots(new Date(), 'mentolder', 60);
    const entry = days.find((d) => d.date === dayKey);
    expect(entry).toBeDefined();
    expect(entry!.slots).toHaveLength(1);
    expect(entry!.slots[0].display).toBe('09:00 - 10:00');
    expect(berlinDayKey(new Date(entry!.slots[0].start))).toBe(dayKey);
    expect(berlinWallMinutes(new Date(entry!.slots[0].start))).toBe(540);
  });

  it('removes slots overlapping busy events', async () => {
    const dayKey = berlinDayKey(new Date(Date.now() + 2 * 86400000));
    dbState.windows = [{ id: 'w1', date: dayKey, winStart: '09:00', winEnd: '10:00' }];
    fetchMock.mockResolvedValue(
      reportWithEvents([
        {
          uid: 'busy-1',
          start: toIcsBasic(Date.parse(`${dayKey}T00:00:00Z`)),
          end: toIcsBasic(Date.parse(`${dayKey}T00:00:00Z`) + 86400000),
          summary: 'Busy',
        },
      ]),
    );
    const days = await getAvailableSlots(new Date(), 'mentolder', 60);
    expect(days.some((d) => d.date === dayKey)).toBe(false);
  });

  it('applies post buffers to busy events (touching slot excluded, next kept)', async () => {
    const dayKey = berlinDayKey(new Date(Date.now() + 2 * 86400000));
    dbState.windows = [{ id: 'w1', date: dayKey, winStart: '09:00', winEnd: '11:00' }];
    fetchMock.mockResolvedValue(
      reportWithEvents([
        {
          uid: 'busy-2',
          start: toIcsBasic(berlinWallToUtcMs(dayKey, 480)),
          end: toIcsBasic(berlinWallToUtcMs(dayKey, 540)),
          summary: 'Busy',
        },
      ]),
    );
    dbState.buffers = { preMin: 0, postMin: 0 };
    const plain = await getAvailableSlots(new Date(), 'mentolder', 60);
    expect(plain.find((d) => d.date === dayKey)!.slots.map((s) => s.display)).toEqual([
      '09:00 - 10:00',
      '10:00 - 11:00',
    ]);
    dbState.buffers = { preMin: 0, postMin: 30 };
    const buffered = await getAvailableSlots(new Date(), 'mentolder', 60);
    expect(buffered.find((d) => d.date === dayKey)!.slots.map((s) => s.display)).toEqual([
      '10:00 - 11:00',
    ]);
  });

  it('skips holidays like vacation days', async () => {
    const dayKey = berlinDayKey(new Date(Date.now() + 2 * 86400000));
    dbState.windows = [{ id: 'w1', date: dayKey, winStart: '09:00', winEnd: '10:00' }];
    dbState.holidays = [dayKey];
    const days = await getAvailableSlots(new Date(), 'mentolder', 60);
    expect(days.some((d) => d.date === dayKey)).toBe(false);
  });

  it('mentolder regression: pins the admin-overview shape for a winter Monday', async () => {
    const now = new Date();
    let monday: Date | null = null;
    for (let i = 1; i <= 8; i++) {
      const cand = new Date(now.getTime() + i * 86400000);
      if (berlinWeekdayIso(cand) === 1) {
        monday = cand;
        break;
      }
    }
    expect(monday).not.toBeNull();
    const days = await getAvailableSlots(now, undefined, 60);
    const entry = days.find((d) => d.date === berlinDayKey(monday!));
    expect(entry).toBeDefined();
    expect(entry!.weekday).toBe('Montag');
    expect(entry!.slots).toHaveLength(8);
    expect(entry!.slots[0].display).toBe('09:00 - 10:00');
    for (const slot of entry!.slots) {
      const start = new Date(slot.start).getTime();
      const end = new Date(slot.end).getTime();
      expect(end - start).toBe(3600000);
    }
  });
});
