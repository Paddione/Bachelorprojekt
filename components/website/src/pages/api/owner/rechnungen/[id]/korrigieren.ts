import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { correctInvoice, getInvoice, type CreateInvoiceInput } from '../../../../../lib/invoices';

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

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function asFloat(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
  const reason = asText(body.reason, 1000);
  if (!reason) return jsonError('Begründung erforderlich, maximal 1000 Zeichen.', 400);

  try {
    const id = params.id ?? '';
    const invoice = id === '' ? null : await getInvoice(id);
    if (!invoice || invoice.brand !== brand) {
      return jsonError('Rechnung nicht gefunden.', 404);
    }
    if (invoice.status === 'storniert') {
      return jsonError('Diese Rechnung wurde bereits storniert.', 409);
    }
    if (invoice.status !== 'offen') {
      return jsonError('Bezahlte Rechnungen können nicht korrigiert werden.', 409);
    }
    // Korrigierte Felder aus dem Body, sonst Originalwerte; die Begründung
    // trägt corrected.notes und landet auf beiden Belegen.
    const extra = asText(body.notes, 2000);
    const corrected: CreateInvoiceInput = {
      customerName: asText(body.customerName, 200) ?? invoice.customerName,
      customerContact: asText(body.customerContact, 320) ?? invoice.customerContact,
      serviceKey: asText(body.serviceKey, 100) ?? invoice.serviceKey,
      serviceName: asText(body.serviceName, 200) ?? invoice.serviceName,
      serviceDurationMin: body.serviceDurationMin === undefined ? invoice.serviceDurationMin : asInt(body.serviceDurationMin) ?? -1,
      unitPriceCents: body.unitPriceCents === undefined ? invoice.unitPriceCents : asInt(body.unitPriceCents) ?? -1,
      taxRate: body.taxRate === undefined ? invoice.taxRate : asFloat(body.taxRate) ?? -1,
      issueDate: asText(body.issueDate, 10) ?? new Date().toISOString().slice(0, 10),
      serviceDate: asText(body.serviceDate, 10) ?? invoice.serviceDate,
      notes: extra ? `${reason}\n${extra}` : reason,
    };
    if (corrected.serviceDurationMin < 0 || corrected.unitPriceCents < 0 || corrected.taxRate < 0) {
      return jsonError('Korrigierte Beträge müssen gültige Zahlen >= 0 sein.', 400);
    }
    const recordedBy = session.preferred_username || session.email;
    const { storno, successor } = await correctInvoice(invoice.id, corrected, recordedBy);
    locals.requestLogger.info(
      { stornoId: storno.id, successorId: successor.id, brand },
      '[owner/rechnungen/korrigieren]',
    );
    if (!wantsJson) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/owner/rechnungen/${encodeURIComponent(successor.id)}` },
      });
    }
    return new Response(
      JSON.stringify({
        cancelled: { id: storno.id, number: storno.number },
        invoice: { id: successor.id, number: successor.number, status: successor.status },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'invoice not found') {
      return jsonError('Rechnung nicht gefunden.', 404);
    }
    if (err instanceof Error && err.message.startsWith('invoice already')) {
      return jsonError('Diese Rechnung wurde bereits storniert.', 409);
    }
    if (err instanceof RangeError) return jsonError(err.message, 400);
    locals.requestLogger.error({ err }, '[owner/rechnungen/korrigieren]');
    return jsonError('Interner Serverfehler.', 500);
  }
};
