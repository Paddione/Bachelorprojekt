import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import {
  getDocumentAssignmentById,
  getDocumentTemplate,
  markAssignmentSigned,
} from '../../../../lib/documents-db';
import { renderTemplate, embedSignature } from '../../../../lib/signing/template-renderer';
import { generatePdf } from '../../../../lib/signing/pdf-service';
import { logSigningEvent } from '../../../../lib/signing/audit';
import type { SignatureData } from '../../../../lib/signing/types';

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { assignmentId } = params;
  if (!assignmentId) {
    return new Response(JSON.stringify({ error: 'Missing assignmentId' }), { status: 400 });
  }

  let body: { signatureType: string; imageData?: string; signerName: string; editableFields?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { signatureType, imageData, signerName, editableFields = {} } = body;
  if (!signerName?.trim()) {
    return new Response(JSON.stringify({ error: 'signerName required' }), { status: 400 });
  }
  if (signatureType === 'canvas' && !imageData) {
    return new Response(JSON.stringify({ error: 'imageData required for canvas signature' }), { status: 400 });
  }

  const assignment = await getDocumentAssignmentById(assignmentId);
  if (!assignment) {
    return new Response(JSON.stringify({ error: 'Assignment not found' }), { status: 404 });
  }
  if (assignment.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Assignment already signed or revoked' }), { status: 409 });
  }
  if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: 'Assignment expired' }), { status: 410 });
  }

  const template = await getDocumentTemplate(assignment.template_id);
  if (!template) {
    return new Response(JSON.stringify({ error: 'Template not found' }), { status: 500 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  const userAgent = request.headers.get('user-agent') ?? '';

  const signatureData: SignatureData = {
    type: signatureType as 'canvas' | 'checkbox',
    imageData: signatureType === 'canvas' ? imageData : undefined,
    signerName: signerName.trim(),
    ip,
    userAgent,
    signedAt: new Date().toISOString(),
  };

  // Render final HTML with signature embedded
  const today = new Date();
  const fixedVars: Record<string, string> = {
    DATUM: today.toLocaleDateString('de-DE'),
    JAHR: String(today.getFullYear()),
  };
  const rendered = renderTemplate(template.html_body, fixedVars, editableFields);
  const signedHtml = embedSignature(rendered, signatureData, editableFields);

  const signedPdf = await generatePdf(signedHtml);

  await markAssignmentSigned(assignmentId, signatureData, signedHtml, signedPdf);
  await logSigningEvent(assignmentId, 'signed', ip, userAgent, session.email);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
