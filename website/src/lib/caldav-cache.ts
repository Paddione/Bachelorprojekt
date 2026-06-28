export const NC_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';
export const NC_USER = process.env.NEXTCLOUD_CALDAV_USER || 'admin';
export const NC_PASS = process.env.NEXTCLOUD_CALDAV_PASSWORD || 'devnextcloudadmin';
export const CALENDAR_NAME = process.env.CALENDAR_NAME || 'personal';

// Configurable working hours
export const WORK_START_HOUR = parseInt(process.env.WORK_START_HOUR || '9');
export const WORK_END_HOUR = parseInt(process.env.WORK_END_HOUR || '17');
export const SLOT_DURATION_MIN = parseInt(process.env.SLOT_DURATION_MIN || '60');
export const WORK_DAYS = (process.env.WORK_DAYS || '1,2,3,4,5').split(',').map(Number);
export const BOOKING_HORIZON_DAYS = parseInt(process.env.BOOKING_HORIZON_DAYS || '21');
export const MIN_ADVANCE_HOURS = parseInt(process.env.MIN_ADVANCE_HOURS || '24');

export const CALDAV_BASE = `${NC_URL}/remote.php/dav/calendars/${NC_USER}/${CALENDAR_NAME}`;
export const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
export const CALDAV_TIMEOUT_MS = parseInt(process.env.CALDAV_TIMEOUT_MS || '8000');

export function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_USER}:${NC_PASS}`).toString('base64');
}

export function unfoldIcal(ical: string): string {
  return ical.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

export async function fetchEventsRaw(from: Date, to: Date): Promise<string[]> {
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

  const res = await fetch(CALDAV_BASE, {
    method: 'REPORT',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
    },
    body,
    signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`[caldav] REPORT failed: ${res.status}`);
  }

  const xml = await res.text();
  const icals: string[] = [];
  const calDataRegex = /<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/gi;
  let match;
  while ((match = calDataRegex.exec(xml)) !== null) {
    const raw = match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    icals.push(unfoldIcal(raw));
  }
  return icals;
}

export function extractICalProp(block: string, prop: string): string | null {
  const regex = new RegExp(`^${prop}[;:](.*)$`, 'mi');
  const match = block.match(regex);
  if (!match) return null;
  const val = match[1];
  const colonIdx = val.indexOf(':');
  return colonIdx >= 0 ? val.substring(colonIdx + 1).trim() : val.trim();
}

export function parseICalDate(val: string): Date {
  const clean = val.replace(/[^0-9TZ]/g, '');
  if (clean.length === 8) {
    return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`);
  }
  const iso = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  return clean.endsWith('Z') ? new Date(iso + 'Z') : new Date(iso);
}
