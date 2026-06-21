import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByKeycloakId } from '../../../../lib/website-db';
import {
  validateProfileInput, updateCustomerProfile, addContactHistoryEntry, type ProfileInput,
} from '../../../../lib/customer-crm-db';
import { updateUserAttribute } from '../../../../lib/identity';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const customer = await getCustomerByKeycloakId(session.sub);
  if (!customer) return json({ error: 'Kein Kundenprofil gefunden.' }, 404);

  let input: ProfileInput;
  try { input = (await request.json()) as ProfileInput; }
  catch { return json({ error: 'Ungültiger Request-Body.' }, 400); }

  const valid = validateProfileInput(input);
  if (!valid.ok) return json({ error: valid.error }, 400);

  const result = await updateCustomerProfile(session.sub, input).catch((e) => {
    locals.requestLogger.error({ e }, '[profile/update] db error'); return null;
  });
  if (!result) return json({ error: 'Speichern fehlgeschlagen.' }, 500);

  if (input.phone) {
    await updateUserAttribute(session.sub, 'phoneNumber', input.phone)
      .catch((e) => locals.requestLogger.error({ e }, '[profile/update] kc sync failed'));
  }

  await addContactHistoryEntry({
    keycloakUserId: session.sub, contactType: 'note',
    subject: 'profile_update', direction: 'inbound',
  }).catch((e) => locals.requestLogger.error({ e }, '[profile/update] history log failed'));

  return json({ ok: true, updatedAt: result.updatedAt });
};
