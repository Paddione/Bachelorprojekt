import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { getAllBookings, updateCalendarEventStatus } from '../../../../../lib/caldav';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';

/** Reads a JSON or HTML-form body into a plain object; empty body yields {}. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const text = await request.text();
    if (text.trim() === '') return {};
    return JSON.parse(text) as Record<string, unknown>;
  }
  try {
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    form.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
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

  // Optional note (e.g. the home-visit exception reason): passed through
  // uninterpreted — echoed in the response plus a structured log entry.
  // It never blocks the cancellation.
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null && body.note !== '') {
    if (typeof body.note !== 'string' || body.note.length > 500) {
      return new Response(JSON.stringify({ error: 'Notiz maximal 500 Zeichen.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    note = body.note;
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

    const ok = await updateCalendarEventStatus(uid, 'CANCELLED');
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Kalender konnte nicht geschrieben werden.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    locals.requestLogger.info({ uid, note, brand }, '[owner/bookings/cancel]');
    return new Response(JSON.stringify({ uid, cancelled: true, note }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/bookings/cancel]');
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
