import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { recordPayment, listPayments } from '../../../../../lib/invoice-payments';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const id = params.id as string;
  const payments = await listPayments(id);
  return new Response(JSON.stringify({ payments }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const id = params.id as string;

  let body: {
    paidAt?: string; amount?: number; method?: string;
    reference?: string; notes?: string;
  };
  try { body = await request.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  if (!body.paidAt || typeof body.amount !== 'number' || !body.method) {
    return new Response('paidAt, amount, method are required', { status: 400 });
  }
  if (!['sepa','cash','bank','other'].includes(body.method)) {
    return new Response('invalid method', { status: 400 });
  }
  if (body.amount < 0 && !body.notes) {
    return new Response('negative amount requires notes', { status: 400 });
  }
  try {
    const payment = await recordPayment({
      invoiceId:  id,
      paidAt:     body.paidAt,
      amount:     body.amount,
      method:     body.method as 'sepa'|'cash'|'bank'|'other',
      reference:  body.reference,
      notes:      body.notes,
      recordedBy: session.email ?? session.sub ?? 'admin',
    });
    return new Response(JSON.stringify({ payment }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = (e as Error).message ?? 'failed';
    if (/exceeds|overshoot|cannot|negative/.test(msg)) {
      return new Response(msg, { status: 400 });
    }
    if (/not found/.test(msg)) {
      return new Response(msg, { status: 404 });
    }
    return new Response(msg, { status: 500 });
  }
};
