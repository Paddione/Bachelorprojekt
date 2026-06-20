import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateCustomerCrm, CUSTOMER_STATUSES, type CustomerStatus } from '../../../../lib/customer-crm-db';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  let body: {
    keycloak_user_id?: string; customer_status?: string;
    acquisition_source?: string; tags?: string[];
  };
  try { body = await request.json(); }
  catch { return json({ error: 'Ungültiger Request-Body.' }, 400); }

  if (!body.keycloak_user_id) return json({ error: 'keycloak_user_id erforderlich' }, 400);
  if (body.customer_status && !CUSTOMER_STATUSES.includes(body.customer_status as CustomerStatus))
    return json({ error: 'Ungültiger Status' }, 400);
  if (body.acquisition_source && body.acquisition_source.length > 100)
    return json({ error: 'Akquisitionskanal zu lang' }, 400);
  if (body.tags) {
    if (!Array.isArray(body.tags) || body.tags.some(t => typeof t !== 'string' || t.length > 40))
      return json({ error: 'Ungültige Tags (max. 40 Zeichen pro Tag)' }, 400);
    if (body.tags.length > 20) return json({ error: 'Zu viele Tags (max. 20)' }, 400);
  }

  const ok = await updateCustomerCrm(body.keycloak_user_id, {
    customer_status: body.customer_status,
    acquisition_source: body.acquisition_source,
    tags: body.tags,
  }).catch((e) => { locals.requestLogger.error({ e }, '[update-crm] db error'); return false; });
  if (!ok) return json({ error: 'Kein Kundenprofil gefunden oder Speichern fehlgeschlagen.' }, 404);

  return json({ ok: true });
};
