import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  addDraftInvoiceItem,
  updateDraftInvoiceItem,
  deleteDraftInvoiceItem,
} from '../../../../../lib/stripe-billing';
import { stripe } from '../../../../../lib/stripe';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv  = await (stripe as any).invoices.retrieve(params.id!);
  const customerId = typeof inv.customer === 'string'
    ? inv.customer
    : (inv.customer as { id: string } | null)?.id ?? '';

  await addDraftInvoiceItem(params.id!, {
    description: String(body.description ?? ''),
    hours:       parseFloat(String(body.hours ?? '1')),
    rateCents:   Math.round(parseFloat(String(body.rateCents ?? '0')) * 100),
  });
  return new Response(null, { status: 204 });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const body = await request.json();
  const invoiceItemId = String(body.invoiceItemId ?? '');
  if (!invoiceItemId) return new Response(null, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = await (stripe as any).invoiceItems.retrieve(invoiceItemId);
  if (item.invoice !== params.id) return new Response(null, { status: 403 });

  await updateDraftInvoiceItem(invoiceItemId, {
    description: body.description !== undefined ? String(body.description) : undefined,
    hours:       body.hours       !== undefined ? parseFloat(String(body.hours))       : undefined,
    rateCents:   body.rateCents   !== undefined ? Math.round(parseFloat(String(body.rateCents)) * 100) : undefined,
  });
  return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const body = await request.json();
  const invoiceItemId = String(body.invoiceItemId ?? '');
  if (!invoiceItemId) return new Response(null, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = await (stripe as any).invoiceItems.retrieve(invoiceItemId);
  if (item.invoice !== params.id) return new Response(null, { status: 403 });

  await deleteDraftInvoiceItem(invoiceItemId);
  return new Response(null, { status: 204 });
};
