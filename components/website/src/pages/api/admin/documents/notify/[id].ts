import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getDocumentAssignmentById } from '../../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../../lib/projects-db';
import { logSigningEvent } from '../../../../../lib/signing/audit';
import nodemailer from 'nodemailer';

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const assignment = await getDocumentAssignmentById(id);
  if (!assignment) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const customer = await getCustomerByEmail(session.email);
  if (!customer?.email) {
    return new Response(JSON.stringify({ error: 'Customer email not found' }), { status: 422 });
  }

  const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
  const signingUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/portal/sign/${id}`
    : `/portal/sign/${id}`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'mailpit.workspace.svc.cluster.local',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.CONTACT_EMAIL ?? 'noreply@mentolder.de',
    to: customer.email,
    subject: `Bitte unterschreiben: ${assignment.template_title}`,
    text: `Hallo ${customer.name ?? ''},\n\nbitte unterschreiben Sie das folgende Dokument:\n\n${signingUrl}\n\nBei Fragen stehen wir gerne zur Verfügung.`,
  });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  await logSigningEvent(id, 'email_sent', ip, null, session.email ?? null);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
