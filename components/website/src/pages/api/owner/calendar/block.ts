import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../lib/owner-guard';
import { getAllBookings, createCalendarEvent } from '../../../../lib/caldav';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';
const BERLIN_TZ = 'Europe/Berlin';
const MAX_RANGE_MS = 31 * 86400000;

// Inline Berlin helpers (p2 is predecessor-free: no imports from other partials).
function berlinParts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
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
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function berlinOffsetMs(ms: number): number {
  const p = berlinParts(new Date(ms));
  return (
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - ms
  );
}

/**
 * Parses an ISO datetime; naive wall time is read as Europe/Berlin.
 * Returns null for empty or unparseable input.
 */
function parseBerlinDateTime(raw: unknown): Date | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const text = raw.trim();
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!naive) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  const year = Number(naive[1]);
  const month = Number(naive[2]);
  const day = Number(naive[3]);
  const hour = Number(naive[4]);
  const minute = Number(naive[5]);
  const second = Number(naive[6] ?? '0');
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    return null;
  }
  const wallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = wallMs - berlinOffsetMs(wallMs);
  return new Date(first - (berlinOffsetMs(first) - berlinOffsetMs(wallMs)));
}

/** Reads a JSON or HTML-form body into a plain object. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>;
  }
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  form.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const brand = ownerBusiness(session).brand ?? BRAND_FALLBACK;

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const start = parseBerlinDateTime(body.start);
  const end = parseBerlinDateTime(body.end);
  if (!start || !end) {
    return new Response(JSON.stringify({ error: 'start und end als ISO-Datumzeit erforderlich.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!(start < end)) {
    return new Response(JSON.stringify({ error: 'start muss vor end liegen.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    return new Response(JSON.stringify({ error: 'Zeitraum maximal 31 Tage.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 200)) {
    return new Response(JSON.stringify({ error: 'reason maximal 200 Zeichen.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const reason = typeof body.reason === 'string' ? body.reason : '';

  try {
    const bookings = await getAllBookings();
    const overlaps = bookings.some((b) => b.status !== 'CANCELLED' && b.start < end && b.end > start);
    if (overlaps) {
      return new Response(JSON.stringify({ error: 'Der Zeitraum überschneidet sich mit einer bestehenden Buchung.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const created = await createCalendarEvent({
      summary: reason ? `Blockiert: ${reason}` : 'Blockiert',
      description: `Von der Inhaberin blockiert (Marke ${brand}).${reason ? ` Grund: ${reason}` : ''}`,
      start,
      end,
    });
    if (!created) {
      return new Response(JSON.stringify({ error: 'Kalender konnte nicht geschrieben werden.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ uid: created.uid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/calendar/block]');
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
