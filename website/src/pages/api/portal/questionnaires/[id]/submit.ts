import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getQAssignment, updateQAssignment } from '../../../../../lib/questionnaire-db';
import { sendQuestionnaireSubmitted } from '../../../../../lib/email';

const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const ADMIN_EMAIL = process.env.CONTACT_EMAIL || process.env.FROM_EMAIL || '';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  if (assignment.status === 'submitted' || assignment.status === 'reviewed') {
    return new Response(JSON.stringify({ error: 'Bereits abgesendet.' }), { status: 409 });
  }

  await updateQAssignment(assignment.id, { status: 'submitted' });

  const auswertungUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/admin/fragebogen/${assignment.id}`
    : `http://web.localhost/admin/fragebogen/${assignment.id}`;
  const clientName = session.name || session.email;
  if (ADMIN_EMAIL) {
    await sendQuestionnaireSubmitted({
      adminEmail: ADMIN_EMAIL,
      clientName,
      questionnaireTitle: assignment.template_title,
      auswertungUrl,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
