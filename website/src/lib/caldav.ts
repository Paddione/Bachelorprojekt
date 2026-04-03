// Nextcloud CalDAV helper.
// Fetches events from the admin's calendar and computes free time slots.

const NC_URL = import.meta.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';
const NC_USER = import.meta.env.NEXTCLOUD_CALDAV_USER || 'admin';
const NC_PASS = import.meta.env.NEXTCLOUD_CALDAV_PASSWORD || 'devnextcloudadmin';
const CALENDAR_NAME = import.meta.env.CALENDAR_NAME || 'personal';

// Configurable working hours (admin sets these)
const WORK_START_HOUR = parseInt(import.meta.env.WORK_START_HOUR || '9');
const WORK_END_HOUR = parseInt(import.meta.env.WORK_END_HOUR || '17');
const SLOT_DURATION_MIN = parseInt(import.meta.env.SLOT_DURATION_MIN || '60');
// Working days: 1=Mon, 2=Tue, ..., 5=Fri
const WORK_DAYS = (import.meta.env.WORK_DAYS || '1,2,3,4,5').split(',').map(Number);
// How many days ahead to show slots
const BOOKING_HORIZON_DAYS = parseInt(import.meta.env.BOOKING_HORIZON_DAYS || '21');
// Minimum hours in advance for a booking
const MIN_ADVANCE_HOURS = parseInt(import.meta.env.MIN_ADVANCE_HOURS || '24');

const CALDAV_BASE = `${NC_URL}/remote.php/dav/calendars/${NC_USER}/${CALENDAR_NAME}`;

function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_USER}:${NC_PASS}`).toString('base64');
}

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

// Fetch events from Nextcloud CalDAV for a date range
async function fetchEvents(from: Date, to: Date): Promise<CalEvent[]> {
  const fromStr = from.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const toStr = to.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${fromStr}" end="${toStr}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  try {
    const res = await fetch(CALDAV_BASE, {
      method: 'REPORT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1',
      },
      body,
    });

    if (!res.ok) {
      console.error('[caldav] REPORT failed:', res.status, await res.text());
      return [];
    }

    const xml = await res.text();
    return parseICalEvents(xml);
  } catch (err) {
    console.error('[caldav] Fetch error:', err);
    return [];
  }
}

// Parse VEVENT blocks from CalDAV XML response
function parseICalEvents(xml: string): CalEvent[] {
  const events: CalEvent[] = [];
  const calDataRegex = /<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/gi;
  let match;

  while ((match = calDataRegex.exec(xml)) !== null) {
    const ical = match[1]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
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

function extractICalProp(block: string, prop: string): string | null {
  // Handle properties with parameters like DTSTART;TZID=Europe/Berlin:20260405T090000
  const regex = new RegExp(`^${prop}[;:](.*)$`, 'mi');
  const match = block.match(regex);
  if (!match) return null;
  const val = match[1];
  const colonIdx = val.indexOf(':');
  return colonIdx >= 0 ? val.substring(colonIdx + 1).trim() : val.trim();
}

function parseICalDate(val: string): Date {
  const clean = val.replace(/[^0-9TZ]/g, '');
  if (clean.length === 8) {
    return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`);
  }
  const iso = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  return clean.endsWith('Z') ? new Date(iso + 'Z') : new Date(iso);
}

// Compute available booking slots for a range of days
export async function getAvailableSlots(fromDate?: Date): Promise<DaySlots[]> {
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

    if (WORK_DAYS.includes(isoDay)) {
      const dayStr = cursor.toISOString().split('T')[0];
      const slots: TimeSlot[] = [];

      for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour += SLOT_DURATION_MIN / 60) {
        const slotStart = new Date(cursor);
        slotStart.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MIN * 60000);

        if (slotStart.getTime() < now.getTime() + MIN_ADVANCE_HOURS * 3600000) continue;

        const hasConflict = events.some(
          (ev) => ev.start < slotEnd && ev.end > slotStart
        );

        if (!hasConflict) {
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
        result.push({
          date: dayStr,
          weekday: WEEKDAYS_DE[dayOfWeek],
          slots,
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

// Create a calendar event in Nextcloud
export async function createCalendarEvent(params: {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  attendeeName?: string;
}): Promise<boolean> {
  const uid = crypto.randomUUID();
  const formatDt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  let attendeeLine = '';
  if (params.attendeeEmail) {
    const cn = params.attendeeName || params.attendeeEmail;
    attendeeLine = `ATTENDEE;CN=${cn};RSVP=TRUE:mailto:${params.attendeeEmail}\n`;
  }

  const ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//mentolder.de//Booking//DE
BEGIN:VEVENT
UID:${uid}@mentolder.de
DTSTART:${formatDt(params.start)}
DTEND:${formatDt(params.end)}
SUMMARY:${params.summary}
DESCRIPTION:${params.description.replace(/\n/g, '\\n')}
${attendeeLine}STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  try {
    const res = await fetch(`${CALDAV_BASE}/${uid}.ics`, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ical,
    });

    if (res.ok || res.status === 201) return true;
    console.error('[caldav] Create event failed:', res.status, await res.text());
    return false;
  } catch (err) {
    console.error('[caldav] Create event error:', err);
    return false;
  }
}
