import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getCustomerFullById, upsertCustomer } from '../../../../lib/website-db';
import { createUser, sendPasswordResetEmail, listUsers } from '../../../../lib/keycloak';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as { customerId?: string };
  if (!body.customerId) {
    return new Response(JSON.stringify({ error: 'customerId erforderlich' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const customer = await getCustomerFullById(body.customerId);
  if (!customer) {
    return new Response(JSON.stringify({ error: 'Kunde nicht gefunden' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const spaceIdx = customer.name.indexOf(' ');
  const firstName = spaceIdx > -1 ? customer.name.slice(0, spaceIdx) : customer.name;
  const lastName = spaceIdx > -1 ? customer.name.slice(spaceIdx + 1) : '';

  const result = await createUser({
    email: customer.email,
    firstName,
    lastName,
    phone: customer.phone,
    company: customer.company,
  });

  let userId = result.userId;
  if (!result.success && result.error?.includes('bereits')) {
    const allUsers = await listUsers();
    const existing = allUsers.find(u => u.email?.toLowerCase() === customer.email.toLowerCase());
    if (existing) {
      userId = existing.id;
    } else {
      return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
  } else if (!result.success || !userId) {
    return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (result.success) {
    await sendPasswordResetEmail(userId);
  }
  await upsertCustomer({
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    keycloakUserId: userId,
  });

  return new Response(
    JSON.stringify({ success: true, message: `${customer.name} wurde eingeschrieben. Passwort-Email wurde gesendet.` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
