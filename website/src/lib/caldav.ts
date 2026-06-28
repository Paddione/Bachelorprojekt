// Nextcloud CalDAV helper.
// Fetches events from the admin's calendar and computes free time slots.
import { config } from '../config/index.js';
import {
  NC_URL,
  NC_USER,
  NC_PASS,
  CALENDAR_NAME,
  WORK_START_HOUR,
  WORK_END_HOUR,
  SLOT_DURATION_MIN,
  WORK_DAYS,
  BOOKING_HORIZON_DAYS,
  MIN_ADVANCE_HOURS,
  CALDAV_BASE,
  BRAND_NAME,
  CALDAV_TIMEOUT_MS,
  getAuthHeader,
  unfoldIcal,
  fetchEventsRaw,
  extractICalProp,
  parseICalDate
} from './caldav-cache.js';

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
    console.error('[caldav] fetchEvents failed, treating as no busy times:', err);
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
    console.error('[caldav] getClientBookings failed:', err);
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

// Compute available booking slots for a range of days.
// When brand is provided, slots are generated from admin-defined free time windows.
// Without brand, all calendar-free slots in working hours are returned (admin overview).
export async function getAvailableSlots(fromDate?: Date, brand?: string, slotDurationMin?: number): Promise<DaySlots[]> {
  const duration = slotDurationMin ?? SLOT_DURATION_MIN;

  // windowsMap: date string → array of {winStart, winEnd} (HH:MM strings)
  let windowsMap: Map<string, Array<{ winStart: string; winEnd: string }>> | null = null;
  const vacationDays: Set<string> = new Set();
  const effectiveBrand = brand || config.brand;

  if (brand) {
    try {
      const { getFreeTimeWindows } = await import('./website-db.js');
      const fromStr = (fromDate || new Date()).toISOString().split('T')[0];
      const horizonDate = new Date(fromDate || new Date());
      horizonDate.setDate(horizonDate.getDate() + BOOKING_HORIZON_DAYS);
      const toStr = horizonDate.toISOString().split('T')[0];
      const windows = await getFreeTimeWindows(brand, fromStr, toStr);
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
      const cur = new Date(p.start);
      const endDate = new Date(p.end);
      while (cur <= endDate) {
        vacationDays.add(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }
    }
  } catch {
    // vacation periods unavailable — continue without them
  }

  const now = new Date();
  const start = fromDate || now;
  const end = new Date(start);
  end.setDate(end.getDate() + BOOKING_HORIZON_DAYS);

  const events = await fetchEvents(start, end);

  const result: DaySlots[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < end) {
    const dayOfWeek = cursor.getDay();
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const dayStr = cursor.toISOString().split('T')[0];

    if (vacationDays.has(dayStr)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

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
          const slotStart = new Date(cursor);
          slotStart.setHours(Math.floor(t / 60), t % 60, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);

          if (slotStart.getTime() < now.getTime() + MIN_ADVANCE_HOURS * 3600000) continue;
          if (events.some((ev) => ev.start < slotEnd && ev.end > slotStart)) continue;

          const startHH = slotStart.getHours().toString().padStart(2, '0');
          const startMM = slotStart.getMinutes().toString().padStart(2, '0');
          const endHH = slotEnd.getHours().toString().padStart(2, '0');
          const endMM = slotEnd.getMinutes().toString().padStart(2, '0');
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            display: `${startHH}:${startMM} - ${endHH}:${endMM}`,
          });
        }
      }
    } else if (WORK_DAYS.includes(isoDay)) {
      // Admin overview: all calendar-free slots in configured working hours
      for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour += duration / 60) {
        const slotStart = new Date(cursor);
        slotStart.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);

        if (slotStart.getTime() < now.getTime() + MIN_ADVANCE_HOURS * 3600000) continue;
        if (events.some((ev) => ev.start < slotEnd && ev.end > slotStart)) continue;

        const startHH = slotStart.getHours().toString().padStart(2, '0');
        const startMM = slotStart.getMinutes().toString().padStart(2, '0');
        const endHH = slotEnd.getHours().toString().padStart(2, '0');
        const endMM = slotEnd.getMinutes().toString().padStart(2, '0');
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          display: `${startHH}:${startMM} - ${endHH}:${endMM}`,
        });
      }
    }

    if (slots.length > 0) {
      result.push({ date: dayStr, weekday: WEEKDAYS_DE[dayOfWeek], slots });
    }

    cursor.setDate(cursor.getDate() + 1);
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
    console.error('[caldav] Delete event error:', err);
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
    console.error('[caldav] Update event status error:', err);
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

  const formatDt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  try {
    const getRes = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    if (!getRes.ok) return false;
    let ical = await getRes.text();

    ical = ical.replace(/DTSTART[^\r\n]+/i, `DTSTART:${formatDt(newStart)}`);
    ical = ical.replace(/DTEND[^\r\n]+/i, `DTEND:${formatDt(newEnd)}`);

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
    console.error('[caldav] Update event time error:', err);
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
  const formatDt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

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
    `DTSTART:${formatDt(params.start)}`,
    `DTEND:${formatDt(params.end)}`,
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
    console.error('[caldav] Create event failed:', res.status, await res.text());
    return null;
  } catch (err) {
    console.error('[caldav] Create event error:', err);
    return null;
  }
}
