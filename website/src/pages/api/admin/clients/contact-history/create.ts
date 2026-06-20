import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addContactHistoryEntry, CONTACT_TYPES, type ContactType } from '../../../../../lib/customer-crm-db';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  let body: {
    keycloak_user_id?: string; contact_type?: string;
    subject?: string; content?: string; direction?: string;
  };
  try { body = await request.json(); }
  catch { return json({ error: 'Ungültiger Request-Body.' }, 400); }

  if (!body.keycloak_user_id) return json({ error: 'keycloak_user_id erforderlich' }, 400);
  if (!body.contact_type || !CONTACT_TYPES.includes(body.contact_type as ContactType))
    return json({ error: 'Ungültiger contact_type' }, 400);
  if (!body.subject?.trim() || body.subject.length > 200)
    return json({ error: 'Betreff erforderlich (max. 200 Zeichen)' }, 400);
  if (body.content && body.content.length > 5000)
    return json({ error: 'Inhalt zu lang (max. 5000 Zeichen)' }, 400);
  if (body.direction && !['inbound', 'outbound'].includes(body.direction))
    return json({ error: 'Ungültige Richtung' }, 400);

  const entry = await addContactHistoryEntry({
    keycloakUserId: body.keycloak_user_id,
    contactType: body.contact_type,
    subject: body.subject.trim(),
    content: body.content?.trim(),
    direction: body.direction,
    adminId: session.sub,
  }).catch((e) => { locals.requestLogger.error({ e }, '[contact-history/create] db error'); return null; });
  if (!entry) return json({ error: 'Speichern fehlgeschlagen.' }, 500);

  return json({ ok: true, entry });
};
