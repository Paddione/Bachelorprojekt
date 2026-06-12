import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getDocumentAssignmentById, getAssignmentPdf } from '../../../../../lib/documents-db';
import { logSigningEvent } from '../../../../../lib/signing/audit';

export const GET: APIRoute = async ({ params, request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { assignmentId } = params;
  if (!assignmentId) return new Response('Missing assignmentId', { status: 400 });

  const assignment = await getDocumentAssignmentById(assignmentId);
  if (!assignment) return new Response('Not found', { status: 404 });
  if (assignment.status !== 'completed') {
    return new Response('Document not signed yet', { status: 409 });
  }

  const pdfBuffer = await getAssignmentPdf(assignmentId);
  if (!pdfBuffer) return new Response('PDF not available', { status: 404 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  await logSigningEvent(assignmentId, 'pdf_downloaded', ip, null, session.email);

  const inline = url.searchParams.get('inline') === '1';
  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="dokument-${assignmentId}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
};
