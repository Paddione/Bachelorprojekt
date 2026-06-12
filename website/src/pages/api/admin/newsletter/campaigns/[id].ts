import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCampaign } from '../../../../../lib/newsletter-db';

interface UpdateCampaignBody {
  subject?: string;
  html_body?: string;
  scheduled_publish_at?: string | null;
  status?: 'draft' | 'scheduled';
}

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  let body: UpdateCampaignBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  let scheduledAt: Date | null | undefined;
  if (body.scheduled_publish_at !== undefined) {
    if (body.scheduled_publish_at === null) {
      scheduledAt = null;
    } else {
      const dt = new Date(body.scheduled_publish_at);
      if (Number.isNaN(dt.getTime())) {
        return new Response(JSON.stringify({ error: 'Ungültiges Datum' }), { status: 400 });
      }
      if (dt <= new Date()) {
        return new Response(JSON.stringify({ error: 'Sendezeitpunkt muss in der Zukunft liegen' }), { status: 400 });
      }
      scheduledAt = dt;
    }
  }
  if (body.status === 'scheduled' && !(scheduledAt instanceof Date)) {
    return new Response(JSON.stringify({ error: 'scheduled_publish_at ist erforderlich' }), { status: 400 });
  }

  const updated = await updateCampaign(id, {
    subject: body.subject,
    html_body: body.html_body,
    scheduled_publish_at: scheduledAt,
    status: body.status,
  });
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Kampagne nicht gefunden oder bereits versendet' }), { status: 403 });
  }
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
