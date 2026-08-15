import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { runDunningDetection, listPendingDunnings } from '../../../../../lib/invoice-dunning';

export const POST: APIRoute = async ({ request }) => {
  const cronSecret = request.headers.get('X-Cron-Secret');
  const session = await getSession(request.headers.get('cookie'));
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  if (!isCron && (!session || !isAdmin(session))) {
    return new Response('Forbidden', { status: 403 });
  }
  const brand = process.env.BRAND || 'mentolder';
  const result = await runDunningDetection(brand);
  const pending = await listPendingDunnings(brand);
  return new Response(JSON.stringify({ ...result, pending: pending.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const brand = process.env.BRAND || 'mentolder';
  const pending = await listPendingDunnings(brand);
  return new Response(JSON.stringify({ pending }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
