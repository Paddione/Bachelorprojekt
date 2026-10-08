import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../lib/owner-guard';
import { getAllBookings } from '../../../../lib/caldav';
import {
  InvoiceDuplicateError,
  createInvoice,
  findInvoiceByAppointmentToken,
  type CreateInvoiceInput,
} from '../../../../lib/invoices';

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
    return jsonError('Ungültige Anfrage.', 400);
  }
  const bookingUid = asText(body.bookingUid, 200);
  if (!bookingUid) return jsonError('bookingUid erforderlich.', 400);

  try {
    const bookings = await getAllBookings();
    const booking = bookings.find((entry) => entry.uid === bookingUid) ?? null;
    if (!booking || booking.status === 'CANCELLED') {
      return jsonError('Termin nicht gefunden.', 404);
    }
    // Dedupe pro Termin: Vorab-Lookup vor dem Insert; ein verlorener Race
    // zweier paralleler POSTs scheitert zusätzlich an der Unique-Restriktion.
    const existing = await findInvoiceByAppointmentToken(bookingUid);
    if (existing) {
      if (existing.brand !== brand) return jsonError('Termin nicht gefunden.', 404);
      return new Response(
        JSON.stringify({ error: 'Für diesen Termin existiert bereits eine Rechnung.', number: existing.number }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const serviceKey = asText(body.serviceKey, 100);
    const serviceName = asText(body.serviceName, 200);
    const serviceDurationMin = asInt(body.serviceDurationMin);
    const unitPriceCents = asInt(body.unitPriceCents);
    if (!serviceKey) return jsonError('serviceKey erforderlich.', 400);
    if (!serviceName) return jsonError('serviceName erforderlich.', 400);
    if (serviceDurationMin === null || serviceDurationMin < 0) {
      return jsonError('serviceDurationMin muss eine ganze Zahl >= 0 sein.', 400);
    }
    if (unitPriceCents === null || unitPriceCents < 0) {
      return jsonError('unitPriceCents muss eine ganze Zahl >= 0 sein.', 400);
    }
    const taxRate = body.taxRate === undefined ? 0 : asFloat(body.taxRate);
    if (taxRate === null || taxRate < 0) return jsonError('taxRate muss eine Zahl >= 0 sein.', 400);
    const serviceDate = typeof body.serviceDate === 'string' && body.serviceDate.trim() !== ''
      ? body.serviceDate.trim()
      : booking.start.toISOString().slice(0, 10);
    const issueDate = typeof body.issueDate === 'string' && body.issueDate.trim() !== ''
      ? body.issueDate.trim()
      : new Date().toISOString().slice(0, 10);
    const input: CreateInvoiceInput = {
      customerName: asText(body.customerName, 200) ?? booking.attendeeName,
      customerContact: asText(body.customerContact, 320) ?? booking.attendeeEmail,
      serviceKey,
      serviceName,
      serviceDurationMin,
      unitPriceCents,
      taxRate,
      issueDate,
      serviceDate,
      appointmentToken: bookingUid,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    };
    const invoice = await createInvoice(brand, input);
    locals.requestLogger.info({ invoiceId: invoice.id, bookingUid, brand }, '[owner/rechnungen/erstellen]');
    return new Response(JSON.stringify(invoice), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof InvoiceDuplicateError) {
      return new Response(
        JSON.stringify({ error: 'Für diesen Termin existiert bereits eine Rechnung.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (err instanceof RangeError) return jsonError(err.message, 400);
    locals.requestLogger.error({ err }, '[owner/rechnungen/erstellen]');
    return jsonError('Interner Serverfehler.', 500);
  }
};
