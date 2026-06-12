import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getDocumentTemplate } from '../../../../../../lib/documents-db';
import { generatePdf } from '../../../../../../lib/signing/pdf-service';
import {
  MOCK_PREVIEW_VARS,
  substituteTemplatePlaceholders,
} from '../../../../../../lib/signing/preview-vars';

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'vorlage';
}

export const GET: APIRoute = async ({ params, request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return new Response('Missing id', { status: 400 });

  const template = await getDocumentTemplate(id);
  if (!template) return new Response('Not found', { status: 404 });

  const html = substituteTemplatePlaceholders(template.html_body, MOCK_PREVIEW_VARS);
  const pdf = await generatePdf(html);

  const inline = url.searchParams.get('inline') === '1';
  const filename = `vorschau-${sanitizeFilename(template.title)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    },
  });
};
