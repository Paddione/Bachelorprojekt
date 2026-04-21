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

  const url    = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const body  = await request.json().catch(() => ({}));
  const now   = new Date();
  const year  = body.year  ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const month = body.month ?? (now.getMonth() === 0 ? 12 : now.getMonth());

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric',
  });

  const groups = await getUnbilledBillableEntriesByCustomer(year, month);
  if (groups.length === 0) {
    return Response.json({ created: 0, dryRun, message: 'Keine abrechenbaren Einträge gefunden.' });
  }

  if (dryRun) {
    const preview = groups.map(g => ({
      customerName: g.customerName,
      customerEmail: g.customerEmail,
      entryCount: g.entries.length,
      totalMinutes: g.entries.reduce((s, e) => s + e.minutes, 0),
    }));
    return Response.json({ dryRun: true, wouldCreate: groups.length, period: monthLabel, preview });
  }

  // Create invoices and immediately mark each customer's time entries to prevent
  // duplicate invoices if the endpoint is called again before all entries are marked.
  let created = 0;
  let skipped = 0;

  for (const group of groups) {
    try {
      const invoiceMap = await createMonthlyDraftInvoices([group], monthLabel);
      const invoiceId = invoiceMap.get(group.customerId);
      if (invoiceId) {
        await setTimeEntryStripeInvoice(group.entries.map(e => e.id), invoiceId);
        created++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[billing] Failed for customer ${group.customerId}:`, err);
      skipped++;
    }
  }

  return Response.json({ created, skipped, period: monthLabel });
};
