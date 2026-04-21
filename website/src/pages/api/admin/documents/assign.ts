import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDocumentTemplate, createDocumentAssignment } from '../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { createTemplate, createSubmission } from '../../../../lib/docuseal';
import { getUserById } from '../../../../lib/keycloak';

// Substitutes {{VARIABLE}} placeholders in the HTML with customer data.
// Available variables that the Dokumenteneditor can use:
//   {{KUNDENNAME}}    – full name from customers table
//   {{KUNDENNUMMER}}  – customer number (e.g. M0042)
//   {{EMAIL}}         – email address
//   {{TELEFON}}       – phone number
//   {{FIRMA}}         – company name
//   {{VORNAME}}       – first name from Keycloak
//   {{NACHNAME}}      – last name from Keycloak
//   {{DATUM}}         – current date in German format (TT.MM.JJJJ)
//   {{JAHR}}          – current year (JJJJ)
function substituteVars(html: string, vars: {
  name: string;
  customerNumber: string;
  email: string;
  phone: string;
  company: string;
  firstName: string;
  lastName: string;
}): string {
  const now = new Date();
  const datum = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const jahr = now.getFullYear().toString();
  return html
    .replace(/\{\{KUNDENNAME\}\}/g, vars.name)
    .replace(/\{\{KUNDENNUMMER\}\}/g, vars.customerNumber)
    .replace(/\{\{EMAIL\}\}/g, vars.email)
    .replace(/\{\{TELEFON\}\}/g, vars.phone)
    .replace(/\{\{FIRMA\}\}/g, vars.company)
    .replace(/\{\{VORNAME\}\}/g, vars.firstName)
    .replace(/\{\{NACHNAME\}\}/g, vars.lastName)
    .replace(/\{\{DATUM\}\}/g, datum)
    .replace(/\{\{JAHR\}\}/g, jahr);
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

  // Substitute all {{VARIABLE}} placeholders with real customer data before
  // sending to DocuSeal — each assignment gets its own rendered template so
  // client-specific fields (name, number, date) are already embedded in the PDF.
  const renderedHtml = substituteVars(template.html_body, {
    name: customer.name,
    customerNumber: customer.customer_number ?? '',
    email: customer.email,
    phone: customer.phone ?? '',
    company: customer.company ?? '',
    firstName: kcUser.firstName ?? '',
    lastName: kcUser.lastName ?? '',
  });

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
