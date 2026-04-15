import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDueFollowUps } from '../../../../lib/website-db';
import { postWebhook } from '../../../../lib/mattermost';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const due = await getDueFollowUps();
  if (due.length === 0) {
    return Response.json({ sent: false, message: 'Keine fälligen Follow-ups.' });
  }

  const lines = due.map(f => {
    const client = f.clientName ?? f.clientEmail ?? 'Unbekannt';
    const date   = new Date(f.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `• **${client}** — ${f.reason} (fällig: ${date})`;
  });

  const message = `### 🔔 Follow-up Erinnerung\n\n${lines.join('\n')}\n\n[Follow-ups öffnen](/admin/followups)`;

  const sent = await postWebhook({ text: message });

  return Response.json({ sent, count: due.length });
};
