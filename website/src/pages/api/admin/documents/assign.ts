import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDocumentTemplate, createDocumentAssignment } from '../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { createTemplate, createSubmission } from '../../../../lib/docuseal';
import { getUserById } from '../../../../lib/keycloak';

// Substitutes fixed {{VARIABLE}} placeholders in the HTML.
// Fixed vars are embedded directly in the PDF — they cannot be changed by the signer.
// Editable vars (KUNDENNAME, EMAIL, TELEFON, FIRMA, VORNAME, NACHNAME) are left as-is
// so DocuSeal creates form fields for them; they are pre-filled via createSubmission values.
//
// Fixed:    {{KUNDENNUMMER}} {{DATUM}} {{JAHR}} {{Stand}}
// Editable: {{KUNDENNAME}} {{EMAIL}} {{TELEFON}} {{FIRMA}} {{VORNAME}} {{NACHNAME}}
function substituteFixedVars(html: string, vars: {
  customerNumber: string;
  standDate: string;
}): string {
  const now = new Date();
  const datum = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const jahr = now.getFullYear().toString();
  return html
    .replace(/\{\{KUNDENNUMMER\}\}/g, vars.customerNumber)
    .replace(/\{\{DATUM\}\}/g, datum)
    .replace(/\{\{JAHR\}\}/g, jahr)
    .replace(/\{\{Stand\}\}/g, vars.standDate);
}

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

  // Substitute only fixed variables server-side. Customer-editable fields
  // (KUNDENNAME, EMAIL, TELEFON, FIRMA, VORNAME, NACHNAME) are left as DocuSeal
  // form fields so the signer can review and correct them before signing.
  const renderedHtml = substituteFixedVars(template.html_body, {
    customerNumber: customer.customer_number ?? '',
    standDate: template.stand_date ?? '',
  });

  // Pre-fill editable DocuSeal fields with current customer data.
  const prefillValues: Record<string, string> = {
    KUNDENNAME: customer.name,
    EMAIL: customer.email,
    TELEFON: customer.phone ?? '',
    FIRMA: customer.company ?? '',
    VORNAME: kcUser.firstName ?? '',
    NACHNAME: kcUser.lastName ?? '',
  };

  // Always create a fresh DocuSeal template per assignment so the embedded
  // data is immutable for each client (never reuse the base template ID).
  let dsTemplateId: number;
  try {
    dsTemplateId = await createTemplate(
      `${template.title} — ${customer.name}`,
      renderedHtml,
    );
  } catch (err) {
    console.error('DocuSeal createTemplate error:', err);
    return new Response(JSON.stringify({ error: 'DocuSeal-Vorlage konnte nicht erstellt werden.' }), { status: 502 });
  }

  let submitter;
  try {
    submitter = await createSubmission({
      templateId: dsTemplateId,
      submitterEmail: kcUser.email,
      submitterName: `${kcUser.firstName ?? ''} ${kcUser.lastName ?? ''}`.trim() || kcUser.username,
      prefillValues,
    });
  } catch (err) {
    console.error('DocuSeal createSubmission error:', err);
    return new Response(JSON.stringify({ error: 'DocuSeal-Submission konnte nicht erstellt werden.' }), { status: 502 });
  }

  const assignment = await createDocumentAssignment({
    customerId: customer.id,
    templateId: template.id,
    dsTemplateId,
    submissionSlug: submitter.slug,
    embedSrc: submitter.embed_src,
  });

  return new Response(JSON.stringify(assignment), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
