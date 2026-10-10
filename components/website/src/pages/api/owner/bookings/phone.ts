import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../lib/owner-guard';
import { getAllBookings, createCalendarEvent } from '../../../../lib/caldav';
import { isSlotInAnyWindow, isSlotWhitelisted, claimSlot } from '../../../../lib/website-db';
import { berlinDayKey } from '../../../../lib/caldav-cache';
import massageCatalogue from '../../../../../content/massage/leistungen.json';
import type { LeistungCategory } from '../../../../content-schema';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';
const BERLIN_TZ = 'Europe/Berlin';

const catalogue: LeistungCategory[] = massageCatalogue;

// Local Berlin parts/offset for naive-datetime parsing; day keys come from
// the shared caldav-cache helper to avoid logic drift.
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

/** Accepts numbers and numeric strings (HTML forms submit strings). */
function toDuration(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
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

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return new Response(JSON.stringify({ error: 'Name erforderlich.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const services = catalogue.flatMap((cat) => cat.services);
  const entry = typeof body.serviceKey === 'string' ? services.find((s) => s.key === body.serviceKey) : undefined;
  if (!entry) {
    return new Response(JSON.stringify({ error: 'Unbekannte Leistung.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let durationMin = entry.durationMin ?? 0;
  if (body.durationMin !== undefined && body.durationMin !== null && body.durationMin !== '') {
    const parsed = toDuration(body.durationMin);
    if (parsed === undefined || parsed <= 0) {
      return new Response(JSON.stringify({ error: 'durationMin muss eine positive Ganzzahl sein.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    durationMin = parsed;
  }
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    return new Response(JSON.stringify({ error: 'Dauer unbekannt.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const phone = typeof body.phone === 'string' ? body.phone : undefined;
  const attendeeEmail = typeof body.attendeeEmail === 'string' ? body.attendeeEmail : undefined;

  const start = parseBerlinDateTime(body.start);
  if (!start) {
    return new Response(JSON.stringify({ error: 'start als ISO-Datumzeit erforderlich.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const end = new Date(start.getTime() + durationMin * 60000);

  // Lead time: same Berlin-day mathematics as the public booking path.
  if (berlinDayKey(start) <= berlinDayKey(new Date())) {
    return new Response(JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let inWindow = false;
    try {
      inWindow = await isSlotInAnyWindow(brand, start, end);
    } catch {
      inWindow = false;
    }
    if (!inWindow) {
      return new Response(JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const bookings = await getAllBookings();
    const overlaps = bookings.some((b) => b.status !== 'CANCELLED' && b.start < end && b.end > start);
    if (overlaps) {
      return new Response(JSON.stringify({ error: 'Der Zeitraum überschneidet sich mit einer bestehenden Buchung.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let released = false;
    try {
      released = await isSlotWhitelisted(brand, start);
    } catch {
      released = false;
    }
    if (released) {
      let claimed = false;
      try {
        claimed = await claimSlot(brand, start);
      } catch {
        claimed = false;
      }
      if (!claimed) {
        return new Response(JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const contact = [phone, attendeeEmail].filter((v): v is string => !!v).join(' / ');
    const created = await createCalendarEvent({
      summary: `Telefon-Buchung: ${entry.name} (${name})`,
      description:
        `Telefon-Buchung durch die Inhaberin.\nName: ${name}` +
        (contact ? `\nKontakt: ${contact}` : '') +
        `\nLeistung: ${entry.name} (${entry.key}), Preis: ${entry.price}, Dauer: ${durationMin} Min.`,
      start,
      end,
      attendeeEmail: attendeeEmail && attendeeEmail.includes('@') ? attendeeEmail : undefined,
      attendeeName: name,
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
    locals.requestLogger.error({ err }, '[owner/bookings/phone]');
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
