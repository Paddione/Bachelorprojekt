import type { APIRoute } from 'astro';
import { saveStalenessReport } from '../../../lib/website-db';
import { sendAdminNotification } from '../../../lib/notifications';

const WEBHOOK_SECRET = process.env.STALENESS_WEBHOOK_SECRET ?? '';

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const report = body as { findings?: unknown[]; summary?: string };
  const issueCount = Array.isArray(report.findings)
    ? report.findings.filter((f: any) => f.status !== 'ok').length
    : 0;
  const summary = report.summary ?? '';

  await saveStalenessReport({ reportJson: body as Record<string, unknown>, summary, issueCount });

  await sendAdminNotification({
    type: 'staleness',
    subject: `Staleness Report: ${issueCount} Auffälligkeit${issueCount !== 1 ? 'en' : ''} gefunden`,
    text: `Wöchentlicher Staleness-Audit abgeschlossen.\n${issueCount} System${issueCount !== 1 ? 'e brauchen' : ' braucht'} Aufmerksamkeit.\n\n${summary}`,
    html: `<h2>Wöchentlicher Staleness-Report</h2><p><strong>${issueCount} System${issueCount !== 1 ? 'e brauchen' : ' braucht'} Aufmerksamkeit</strong></p><p>${summary.replace(/\n/g, '<br>')}</p>`,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
