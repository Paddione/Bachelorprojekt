import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { getInvoice, markPaid } from '../../../../../lib/invoices';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';

type ManualMethod = 'sepa' | 'cash' | 'bank' | 'other';

function isManualMethod(value: unknown): value is ManualMethod {
  return value === 'sepa' || value === 'cash' || value === 'bank' || value === 'other';
}

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

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
  const wantsJson = (request.headers.get('content-type') ?? '').includes('application/json');

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return jsonError('Ungültige Anfrage.', 400);
  }
  const status = body.status;
  if (status !== 'bezahlt' && status !== 'offen') {
    return jsonError('status muss bezahlt oder offen sein.', 400);
  }
  if (status === 'bezahlt' && !isManualMethod(body.method)) {
    return jsonError('Methode muss sepa, cash, bank oder other sein.', 400);
  }

  try {
    const id = params.id ?? '';
    const invoice = id === '' ? null : await getInvoice(id);
    if (!invoice || invoice.brand !== brand) {
      return jsonError('Rechnung nicht gefunden.', 404);
    }
    if (invoice.status === 'storniert') {
      return jsonError('Stornierte Rechnungen können nicht bebucht werden.', 409);
    }
    if (invoice.status === status) {
      return jsonError('Rechnung hat diesen Status bereits.', 409);
    }
    // Die Lib kennt nur offen zu bezahlt: bezahlt zu offen ist kein legaler
    // Übergang (Korrektur läuft über Storno und Neuausstellung).
    if (status === 'offen') {
      return jsonError(
        'Bezahlte Rechnungen können nicht auf offen zurückgesetzt werden. Bitte stornieren und neu ausstellen.',
        409,
      );
    }
    const recordedBy = session.preferred_username || session.email;
    const paid = await markPaid(invoice.id, body.method as ManualMethod, recordedBy);
    locals.requestLogger.info(
      { invoiceId: paid.id, status: paid.status, brand },
      '[owner/rechnungen/zahlungsstatus]',
    );
    if (!wantsJson) return new Response(null, {
      status: 303,
      headers: { Location: `/owner/rechnungen/${encodeURIComponent(paid.id)}` },
    });
    return new Response(
      JSON.stringify({ id: paid.id, status: paid.status, paidAmount: paid.grossAmountCents }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'invoice not found') {
      return jsonError('Rechnung nicht gefunden.', 404);
    }
    if (err instanceof Error && err.message.startsWith('illegal transition')) {
      return jsonError('Rechnung hat diesen Status bereits.', 409);
    }
    if (err instanceof RangeError) return jsonError(err.message, 400);
    locals.requestLogger.error({ err }, '[owner/rechnungen/zahlungsstatus]');
    return jsonError('Interner Serverfehler.', 500);
  }
};
