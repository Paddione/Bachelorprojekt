import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDocumentTemplate, createDocumentAssignment } from '../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../lib/projects-db';
import { getUserById } from '../../../../lib/identity';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { templateId, keycloakUserId } = await request.json();
  if (!templateId || !keycloakUserId) {
    return new Response(JSON.stringify({ error: 'templateId und keycloakUserId erforderlich.' }), { status: 400 });
  }

  const template = await getDocumentTemplate(templateId);
  if (!template) {
    return new Response(JSON.stringify({ error: 'Vorlage nicht gefunden.' }), { status: 404 });
  }

  const kcUser = await getUserById(keycloakUserId).catch(() => null);
  if (!kcUser?.email) {
    return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });
  }

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) {
    return new Response(JSON.stringify({ error: 'Kundeneintrag nicht gefunden.' }), { status: 404 });
  }

  const assignment = await createDocumentAssignment({
    customerId: customer.id,
    templateId: template.id,
    status: 'pending',
  });

  return new Response(JSON.stringify(assignment), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
