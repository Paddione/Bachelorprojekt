import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { sendEmail } from '../../../../../lib/email';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const uid = params.uid;
  if (!uid) return new Response(JSON.stringify({ error: 'Missing uid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let body: { attendeeEmail?: string; attendeeName?: string; summary?: string; dateDisplay?: string; timeDisplay?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  if (!body.attendeeEmail) return new Response(JSON.stringify({ error: 'attendeeEmail required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const ok = await sendEmail({
    to: body.attendeeEmail,
    subject: `Erinnerung: ${body.summary || 'Ihr Termin'} bei ${BRAND_NAME}`,
    text: `Hallo ${body.attendeeName || body.attendeeEmail},\n\ndies ist eine freundliche Erinnerung an Ihren bevorstehenden Termin:\n\n${body.summary || 'Termin'}\n${body.dateDisplay ? `Datum: ${body.dateDisplay}` : ''}\n${body.timeDisplay ? `Uhrzeit: ${body.timeDisplay}` : ''}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
  });

  if (!ok) return new Response(JSON.stringify({ error: 'E-Mail konnte nicht gesendet werden.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
