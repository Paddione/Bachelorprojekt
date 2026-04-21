import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDocumentTemplate, createDocumentAssignment, updateDocumentTemplate } from '../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { createTemplate, createSubmission } from '../../../../lib/docuseal';
import { getUserById } from '../../../../lib/keycloak';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { templateId?: string; keycloakUserId?: string };
  if (!body.templateId || !body.keycloakUserId) {
    return new Response(JSON.stringify({ error: 'templateId und keycloakUserId erforderlich.' }), { status: 400 });
  }

  const template = await getDocumentTemplate(body.templateId);
  if (!template) {
    return new Response(JSON.stringify({ error: 'Vorlage nicht gefunden.' }), { status: 404 });
  }

  const kcUser = await getUserById(body.keycloakUserId).catch(() => null);
  if (!kcUser?.email) {
    return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });
  }

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) {
    return new Response(JSON.stringify({ error: 'Kundeneintrag nicht gefunden.' }), { status: 404 });
  }

  // Create or reuse DocuSeal template
  let dsTemplateId = template.docuseal_template_id;
  if (!dsTemplateId) {
    try {
      dsTemplateId = await createTemplate(template.title, template.html_body);
      await updateDocumentTemplate(template.id, { docuseal_template_id: dsTemplateId });
    } catch (err) {
      console.error('DocuSeal createTemplate error:', err);
      return new Response(JSON.stringify({ error: 'DocuSeal-Vorlage konnte nicht erstellt werden.' }), { status: 502 });
    }
  }

  // Create submission in DocuSeal
  let submitter;
  try {
    submitter = await createSubmission({
      templateId: dsTemplateId,
      submitterEmail: kcUser.email,
      submitterName: `${kcUser.firstName ?? ''} ${kcUser.lastName ?? ''}`.trim() || kcUser.username,
    });
  } catch (err) {
    console.error('DocuSeal createSubmission error:', err);
    return new Response(JSON.stringify({ error: 'DocuSeal-Submission konnte nicht erstellt werden.' }), { status: 502 });
  }

  const assignment = await createDocumentAssignment({
    customerId: customer.id,
    templateId: template.id,
    submissionSlug: submitter.slug,
    embedSrc: submitter.embed_src,
  });

  return new Response(JSON.stringify(assignment), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
