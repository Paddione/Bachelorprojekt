import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getQTemplate, createQAssignment } from '../../../../lib/questionnaire-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { getUserById } from '../../../../lib/keycloak';
import { sendQuestionnaireAssigned } from '../../../../lib/email';

const PROD_DOMAIN = process.env.PROD_DOMAIN || '';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { templateId?: string; keycloakUserId?: string };
  if (!body.templateId || !body.keycloakUserId) {
    return new Response(JSON.stringify({ error: 'templateId und keycloakUserId erforderlich.' }), { status: 400 });
  }

  const tpl = await getQTemplate(body.templateId);
  if (!tpl) return new Response(JSON.stringify({ error: 'Vorlage nicht gefunden.' }), { status: 404 });
  if (tpl.status !== 'published') {
    return new Response(JSON.stringify({ error: 'Nur veröffentlichte Vorlagen können zugewiesen werden.' }), { status: 409 });
  }

  const kcUser = await getUserById(body.keycloakUserId).catch(() => null);
  if (!kcUser?.email) return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Kundeneintrag nicht gefunden.' }), { status: 404 });

  const assignment = await createQAssignment({ customerId: customer.id, templateId: tpl.id });

  const portalUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/portal/fragebogen/${assignment.id}`
    : `http://web.localhost/portal/fragebogen/${assignment.id}`;
  const clientName = `${kcUser.firstName ?? ''} ${kcUser.lastName ?? ''}`.trim() || kcUser.username;
  await sendQuestionnaireAssigned({ clientEmail: kcUser.email, clientName, questionnaireTitle: tpl.title, portalUrl });

  return new Response(JSON.stringify(assignment), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
