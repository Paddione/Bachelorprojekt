import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listCampaigns, createCampaign } from '../../../../../lib/newsletter-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const campaigns = await listCampaigns();
  return new Response(JSON.stringify(campaigns), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let subject: string, html_body: string;
  try {
    const body = await request.json();
    subject = String(body.subject ?? '').trim();
    html_body = String(body.html_body ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!subject || !html_body) {
    return new Response(JSON.stringify({ error: 'Betreff und Inhalt sind erforderlich' }), { status: 400 });
  }
  const campaign = await createCampaign({ subject, html_body });
  return new Response(JSON.stringify(campaign), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
