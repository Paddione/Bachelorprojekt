import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  getUnbilledBillableEntriesByCustomer,
  setTimeEntryStripeInvoice,
} from '../../../../lib/website-db';
import { createMonthlyDraftInvoices } from '../../../../lib/stripe-billing';

export const POST: APIRoute = async ({ request }) => {
  const cronSecret  = request.headers.get('X-Cron-Secret');
  const session     = await getSession(request.headers.get('cookie'));
  const isCron      = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  const isAdminUser = !!session && isAdmin(session);
  if (!isCron && !isAdminUser) return new Response(null, { status: 403 });

  const body  = await request.json().catch(() => ({}));
  const now   = new Date();
  const year  = body.year  ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const month = body.month ?? (now.getMonth() === 0 ? 12 : now.getMonth());

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric',
  });

  const groups = await getUnbilledBillableEntriesByCustomer(year, month);
  if (groups.length === 0) {
    return Response.json({ created: 0, message: 'Keine abrechenbaren Einträge gefunden.' });
  }

  const invoiceMap = await createMonthlyDraftInvoices(groups, monthLabel);

  for (const group of groups) {
    const invoiceId = invoiceMap.get(group.customerId);
    if (invoiceId) {
      await setTimeEntryStripeInvoice(group.entries.map(e => e.id), invoiceId);
    }
  }

  const skipped = groups.length - invoiceMap.size;
  return Response.json({ created: invoiceMap.size, skipped, period: monthLabel });
};
