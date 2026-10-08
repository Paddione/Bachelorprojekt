// Nextcloud CalDAV helper.
// Fetches events from the admin's calendar and computes free time slots.
import { logger } from './logger';
import { config } from '../config/index.js';
import {
  WORK_START_HOUR,
  WORK_END_HOUR,
  SLOT_DURATION_MIN,
  WORK_DAYS,
  BOOKING_HORIZON_DAYS,
  SLOT_BUFFER_MIN,
  BOOKING_LEADTIME_DAYS,
  BERLIN_TZ,
  CALDAV_BASE,
  BRAND_NAME,
  CALDAV_TIMEOUT_MS,
  getAuthHeader,
  fetchEventsRaw,
  extractICalProp,
  parseICalDate,
  berlinDayKey,
  berlinWallMinutes,
  berlinWeekdayIso
} from './caldav-cache.ts';

export interface CalEvent {
  start: Date;
  end: Date;
  summary: string;
}

export interface TimeSlot {
  start: string; // ISO 8601
  end: string;
  display: string; // "09:00 - 10:00"
}

export interface DaySlots {
  date: string; // YYYY-MM-DD
  weekday: string; // "Montag", etc.
  slots: TimeSlot[];
}

const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Fetch events from Nextcloud CalDAV for a date range.
// Degrades gracefully on error — slot availability returns empty rather than throwing.
async function fetchEvents(from: Date, to: Date): Promise<CalEvent[]> {
  let icals: string[];
  try {
    icals = await fetchEventsRaw(from, to);
  } catch (err) {
    logger.error({ err }, '[caldav] fetchEvents failed, treating as no busy times');
    return [];
  }
  const events: CalEvent[] = [];

  for (const ical of icals) {
    const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
    let eventMatch;

    while ((eventMatch = veventRegex.exec(ical)) !== null) {
      const block = eventMatch[1];
      const dtstart = extractICalProp(block, 'DTSTART');
      const dtend = extractICalProp(block, 'DTEND');
      const summary = extractICalProp(block, 'SUMMARY') || 'Busy';

      if (dtstart) {
        const start = parseICalDate(dtstart);
        const end = dtend ? parseICalDate(dtend) : new Date(start.getTime() + 3600000);
        events.push({ start, end, summary });
      }
    }
  }

  return events;
}


export interface ClientBooking {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  status: string;
}

export interface AdminBooking {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  status: string;
  attendeeEmail: string;
  attendeeName: string;
}

export async function getAllBookings(): Promise<AdminBooking[]> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 90);
  const future = new Date(now);
  future.setDate(future.getDate() + BOOKING_HORIZON_DAYS);

  const icals = await fetchEventsRaw(past, future);
  const bookings: AdminBooking[] = [];

  for (const ical of icals) {
    const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
    let eventMatch;

    while ((eventMatch = veventRegex.exec(ical)) !== null) {
      const block = eventMatch[1];

      const attendeeLineMatch = block.match(/^ATTENDEE([^\r\n]*)/im);
      if (!attendeeLineMatch) continue;

      const attendeeLine = attendeeLineMatch[0];
      const emailMatch = attendeeLine.match(/mailto:(.+)$/i);
      if (!emailMatch) continue;
      const attendeeEmail = emailMatch[1].trim();

      const cnMatch = attendeeLine.match(/CN=([^;:]+)/i);
      const attendeeName = cnMatch ? cnMatch[1].trim() : attendeeEmail;

      const uid = extractICalProp(block, 'UID') || '';
      const dtstart = extractICalProp(block, 'DTSTART');
      const dtend = extractICalProp(block, 'DTEND');
      const summary = extractICalProp(block, 'SUMMARY') || 'Termin';
      const status = extractICalProp(block, 'STATUS') || 'CONFIRMED';

      if (!dtstart) continue;

      bookings.push({
        uid,
        summary,
        start: parseICalDate(dtstart),
        end: dtend ? parseICalDate(dtend) : new Date(parseICalDate(dtstart).getTime() + 3600000),
        status,
        attendeeEmail,
        attendeeName,
      });
    }
  }

  bookings.sort((a, b) => a.start.getTime() - b.start.getTime());
  return bookings;
}

export async function getClientBookings(clientEmail: string): Promise<ClientBooking[]> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 90);
  const future = new Date(now);
  future.setDate(future.getDate() + BOOKING_HORIZON_DAYS);

  let icals: string[];
  try {
    icals = await fetchEventsRaw(past, future);
  } catch (err) {
    logger.error({ err }, '[caldav] getClientBookings failed');
    return [];
  }
  const bookings: ClientBooking[] = [];

  for (const ical of icals) {
    const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
    let eventMatch;

    while ((eventMatch = veventRegex.exec(ical)) !== null) {
      const block = eventMatch[1];
      const attendeePattern = new RegExp(
        `ATTENDEE[^:]*:mailto:${clientEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      );
      if (!attendeePattern.test(block)) continue;

      const dtstart = extractICalProp(block, 'DTSTART');
      const dtend = extractICalProp(block, 'DTEND');
      const summary = extractICalProp(block, 'SUMMARY') || 'Termin';
      const status = extractICalProp(block, 'STATUS') || 'CONFIRMED';

      if (dtstart) {
        const uid = extractICalProp(block, 'UID') || '';
        bookings.push({
          uid,
          summary,
          start: parseICalDate(dtstart),
          end: dtend ? parseICalDate(dtend) : new Date(parseICalDate(dtstart).getTime() + 3600000),
          status,
        });
      }
    }
  }

  bookings.sort((a, b) => b.start.getTime() - a.start.getTime());
  return bookings;
}

// ── Berlin calendar arithmetic (T901023) ──────────────────────────────────
// Pure day-key math on UTC-midnight instants plus Berlin wall-clock mapping.
// DST-safe by construction: Europe/Berlin transitions never fall on midnight.

function addDaysKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

function dayDiff(laterKey: string, earlierKey: string): number {
  return Math.round((Date.parse(laterKey) - Date.parse(earlierKey)) / 86400000);
}

function expandDayRange(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  const count = dayDiff(endKey, startKey);
  if (!Number.isInteger(count) || count < 0) return out;
  for (let i = 0; i <= count; i++) out.push(addDaysKey(startKey, i));
  return out;
}

/** Berlin midnight of a day key as a UTC instant. */
function berlinDayStartUtc(dayKey: string): Date {
  const guess = new Date(`${dayKey}T00:00:00Z`);
  return new Date(guess.getTime() - berlinWallMinutes(guess) * 60000);
}

/** Berlin wall minutes on a day key as a UTC instant. */
function berlinWallToUtc(dayKey: string, minutes: number): Date {
  return new Date(berlinDayStartUtc(dayKey).getTime() + minutes * 60000);
}

function formatMinutes(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Europe/Berlin wall time as iCal local time (YYYYMMDDTHHMMSS). */
function formatBerlinWall(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return `${out.year}${out.month}${out.day}T${out.hour}${out.minute}${out.second}`;
}

// Compute available booking slots for a range of days.
// When brand is provided, slots are generated from admin-defined free time windows.
// Without brand, all calendar-free slots in working hours are returned (admin overview).
// Calendar arithmetic runs in Europe/Berlin; slot start/end stay UTC ISO instants.
export async function getAvailableSlots(fromDate?: Date, brand?: string, slotDurationMin?: number): Promise<DaySlots[]> {
  const duration = slotDurationMin ?? SLOT_DURATION_MIN;

  // windowsMap: date string → array of {winStart, winEnd} (HH:MM strings)
  let windowsMap: Map<string, Array<{ winStart: string; winEnd: string }>> | null = null;
  const vacationDays: Set<string> = new Set();
  const holidayDays: Set<string> = new Set();
  let bufferPreMin = SLOT_BUFFER_MIN;
  let bufferPostMin = SLOT_BUFFER_MIN;
  const effectiveBrand = brand || config.brand;

  if (brand) {
    try {
      const { getFreeTimeWindows } = await import('./website-db.js');
      const fromKey = berlinDayKey(fromDate || new Date());
      const windows = await getFreeTimeWindows(brand, fromKey, addDaysKey(fromKey, BOOKING_HORIZON_DAYS));
      windowsMap = new Map();
      for (const w of windows) {
        if (!windowsMap.has(w.date)) windowsMap.set(w.date, []);
        windowsMap.get(w.date)!.push({ winStart: w.winStart, winEnd: w.winEnd });
      }
    } catch {
      // fall back to showing all slots if windows table missing
    }
  }

  try {
    const { getVacationPeriods } = await import('./website-db.js');
    const periods = await getVacationPeriods(effectiveBrand);
    for (const p of periods) {
      for (const key of expandDayRange(p.start, p.end)) vacationDays.add(key);
    }
  } catch {
    // vacation periods unavailable — continue without them
  }

  try {
    const { getHolidays, getBookingBuffers } = await import('./website-core-db.js');
    for (const day of await getHolidays(effectiveBrand)) holidayDays.add(day);
    const buffers = await getBookingBuffers(effectiveBrand);
    bufferPreMin = buffers.preMin;
    bufferPostMin = buffers.postMin;
  } catch {
    // settings unavailable — continue with SLOT_BUFFER_MIN defaults and no holidays
  }

  const now = new Date();
  const start = fromDate || now;
  const end = new Date(start.getTime() + BOOKING_HORIZON_DAYS * 86400000);

  const events = await fetchEvents(start, end);
  const busy = events.map((ev) => ({
    start: ev.start.getTime() - bufferPreMin * 60000,
    end: ev.end.getTime() + bufferPostMin * 60000,
  }));

  const result: DaySlots[] = [];
  const requestKey = berlinDayKey(now);
  const startKey = berlinDayKey(start);

  for (let i = 0; i < BOOKING_HORIZON_DAYS; i++) {
    const dayStr = addDaysKey(startKey, i);

    // Lead time: the Berlin slot date must be BOOKING_LEADTIME_DAYS calendar
    // days after the Berlin request date (default: previous-day rule).
    if (dayDiff(dayStr, requestKey) < BOOKING_LEADTIME_DAYS) continue;
    if (vacationDays.has(dayStr) || holidayDays.has(dayStr)) continue;

    const isoDay = berlinWeekdayIso(berlinWallToUtc(dayStr, 720));
    const slots: TimeSlot[] = [];

    if (windowsMap !== null) {
      // Customer view: generate slots within admin-defined time windows
      const dayWindows = windowsMap.get(dayStr) ?? [];
      for (const win of dayWindows) {
        const [wsh, wsm] = win.winStart.split(':').map(Number);
        const [weh, wem] = win.winEnd.split(':').map(Number);
        const winStartMin = wsh * 60 + wsm;
        const winEndMin = weh * 60 + wem;

        for (let t = winStartMin; t + duration <= winEndMin; t += duration) {
          const slotStart = berlinWallToUtc(dayStr, t);
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);

          if (busy.some((b) => b.start < slotEnd.getTime() && b.end > slotStart.getTime())) continue;

          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            display: `${formatMinutes(t)} - ${formatMinutes(t + duration)}`,
          });
        }
      }
    } else if (WORK_DAYS.includes(isoDay)) {
      // Admin overview: all calendar-free slots in configured working hours
      for (let t = WORK_START_HOUR * 60; t + duration <= WORK_END_HOUR * 60; t += duration) {
        const slotStart = berlinWallToUtc(dayStr, t);
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);

        if (busy.some((b) => b.start < slotEnd.getTime() && b.end > slotStart.getTime())) continue;

        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          display: `${formatMinutes(t)} - ${formatMinutes(t + duration)}`,
        });
      }
    }

    if (slots.length > 0) {
      result.push({ date: dayStr, weekday: WEEKDAYS_DE[isoDay % 7], slots });
    }
  }

  return result;
}

async function findEventUrl(uid: string): Promise<string | null> {
  const rawUid = uid.replace(/@.+$/, '');
  const url = `${CALDAV_BASE}/${rawUid}.ics`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    if (res.ok) return url;
  } catch {}
  return null;
}

export async function deleteCalendarEvent(uid: string): Promise<boolean> {
  const url = await findEventUrl(uid);
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    return res.ok || res.status === 204;
  } catch (err) {
    logger.error({ err }, '[caldav] Delete event error');
    return false;
  }
}

export async function updateCalendarEventStatus(uid: string, status: 'CANCELLED' | 'CONFIRMED'): Promise<boolean> {
  const url = await findEventUrl(uid);
  if (!url) return false;
  try {
    const getRes = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    if (!getRes.ok) return false;
    let ical = await getRes.text();
    if (/STATUS:/i.test(ical)) {
      ical = ical.replace(/STATUS:[^\r\n]+/i, `STATUS:${status}`);
    } else {
      ical = ical.replace(/END:VEVENT/, `STATUS:${status}\r\nEND:VEVENT`);
    }
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: getAuthHeader(), 'Content-Type': 'text/calendar; charset=utf-8' },
      body: ical,
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    return putRes.ok || putRes.status === 204;
  } catch (err) {
    logger.error({ err }, '[caldav] Update event status error');
    return false;
  }
}

export async function updateCalendarEventTime(
  uid: string,
  newStart: Date,
  newEnd: Date,
): Promise<boolean> {
  const url = await findEventUrl(uid);
  if (!url) return false;

  try {
    const getRes = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    if (!getRes.ok) return false;
    let ical = await getRes.text();

    ical = ical.replace(/DTSTART[^\r\n]+/i, `DTSTART;TZID=${BERLIN_TZ}:${formatBerlinWall(newStart)}`);
    ical = ical.replace(/DTEND[^\r\n]+/i, `DTEND;TZID=${BERLIN_TZ}:${formatBerlinWall(newEnd)}`);

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ical,
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    return putRes.ok || putRes.status === 204;
  } catch (err) {
    logger.error({ err }, '[caldav] Update event time error');
    return false;
  }
}

// Create a calendar event in Nextcloud
export async function createCalendarEvent(params: {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  attendeeName?: string;
}): Promise<{ uid: string } | null> {
  const uid = crypto.randomUUID();

  let attendeeLine = '';
  if (params.attendeeEmail) {
    const cn = params.attendeeName || params.attendeeEmail;
    attendeeLine = `ATTENDEE;CN=${cn};RSVP=TRUE:mailto:${params.attendeeEmail}`;
  }

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BRAND_NAME}//Booking//DE`,
    'BEGIN:VEVENT',
    `UID:${uid}@${BRAND_NAME}`,
    `DTSTART;TZID=${BERLIN_TZ}:${formatBerlinWall(params.start)}`,
    `DTEND;TZID=${BERLIN_TZ}:${formatBerlinWall(params.end)}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    ...(attendeeLine ? [attendeeLine] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';

  try {
    const res = await fetch(`${CALDAV_BASE}/${uid}.ics`, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ical,
    });

    if (res.ok || res.status === 201) return { uid: `${uid}@${BRAND_NAME}` };
    logger.error({ status: res.status, body: await res.text() }, '[caldav] Create event failed');
    return null;
  } catch (err) {
    logger.error({ err }, '[caldav] Create event error');
    return null;
  }
}
