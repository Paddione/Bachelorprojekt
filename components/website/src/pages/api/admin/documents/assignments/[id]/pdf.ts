import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import {
  getDocumentAssignmentById,
  getDocumentTemplate,
  getAssignmentPdf,
} from '../../../../../../lib/documents-db';
import { getCustomerFullById } from '../../../../../../lib/website-db';
import { generatePdf } from '../../../../../../lib/signing/pdf-service';
import { substituteTemplatePlaceholders, buildCustomerVars } from '../../../../../../lib/signing/preview-vars';
import { logSigningEvent } from '../../../../../../lib/signing/audit';

export const GET: APIRoute = async ({ params, request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return new Response('Missing id', { status: 400 });

  const assignment = await getDocumentAssignmentById(id);
  if (!assignment) return new Response('Not found', { status: 404 });

  const inline = url.searchParams.get('inline') === '1';

  let pdf: Buffer;
  if (assignment.status === 'completed') {
    const stored = await getAssignmentPdf(id);
    if (!stored) return new Response('Signed PDF not available', { status: 404 });
    pdf = stored;
  } else {
    let html = assignment.signed_html;
    if (!html) {
      const template = await getDocumentTemplate(assignment.template_id);
      if (!template) return new Response('Template not found', { status: 500 });
      const customer = await getCustomerFullById(assignment.customer_id).catch(() => null);
      const vars = customer
        ? buildCustomerVars(customer)
        : buildCustomerVars({ name: '', email: '' });
      html = substituteTemplatePlaceholders(template.html_body, vars);
    }
    pdf = await generatePdf(html);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  await logSigningEvent(
    id,
    inline ? 'pdf_admin_viewed' : 'pdf_admin_downloaded',
    ip,
    request.headers.get('user-agent'),
    session.email ?? null,
  );

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="vertrag-${id}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    },
  });
};
