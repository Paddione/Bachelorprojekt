import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { getAllBookings, updateCalendarEventTime } from '../../../../../lib/caldav';
import { isSlotInAnyWindow } from '../../../../../lib/website-db';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';
const BERLIN_TZ = 'Europe/Berlin';

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

function berlinDayKey(d: Date): string {
  const p = berlinParts(d);
  return `${p.year}-${p.month}-${p.day}`;
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

export const POST: APIRoute = async ({ request, params, locals }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const brand = ownerBusiness(session).brand ?? BRAND_FALLBACK;

  const uid = params.uid;
  if (!uid) {
    return new Response(JSON.stringify({ error: 'uid erforderlich.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const newStart = parseBerlinDateTime(body.newStart);
  const newEnd = parseBerlinDateTime(body.newEnd);
  if (!newStart || !newEnd) {
    return new Response(JSON.stringify({ error: 'newStart und newEnd als ISO-Datumzeit erforderlich.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!(newStart < newEnd)) {
    return new Response(JSON.stringify({ error: 'newStart muss vor newEnd liegen.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lead re-check: same Berlin-day mathematics as the booking path.
  if (berlinDayKey(newStart) <= berlinDayKey(new Date())) {
    return new Response(JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const bookings = await getAllBookings();
    const existing = bookings.find((b) => b.uid === uid);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Termin nicht gefunden.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let inWindow = false;
    try {
      inWindow = await isSlotInAnyWindow(brand, newStart, newEnd);
    } catch {
      inWindow = false;
    }
    if (!inWindow) {
      return new Response(JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const overlaps = bookings.some(
      (b) => b.uid !== uid && b.status !== 'CANCELLED' && b.start < newEnd && b.end > newStart,
    );
    if (overlaps) {
      return new Response(JSON.stringify({ error: 'Der Zeitraum überschneidet sich mit einer bestehenden Buchung.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // No claimSlot here: the booking being moved already holds its slot.
    const ok = await updateCalendarEventTime(uid, newStart, newEnd);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Kalender konnte nicht geschrieben werden.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ uid, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/bookings/reschedule]');
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
