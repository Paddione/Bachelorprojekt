import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { savePlaywrightReport, getLatestPlaywrightReport } from '../../../../lib/website-db';

const WEBHOOK_TOKEN = process.env.MONITORING_WEBHOOK_TOKEN ?? '';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const report = await getLatestPlaywrightReport();
  if (!report) return new Response('No report', { status: 404 });
  return new Response(report.html, { headers: { 'Content-Type': 'text/html' } });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const html = await request.text();
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return new Response(JSON.stringify({ error: 'Expected HTML body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = await savePlaywrightReport(html);
  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
