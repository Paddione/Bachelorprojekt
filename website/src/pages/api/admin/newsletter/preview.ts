// Server-side newsletter preview — returns the SAME branded wrapper that the
// outbound send path uses (lib/newsletter-template.ts). Fixes T000173 / T000171,
// where the admin iframe rendered raw HTML without header or legal footer
// while the actual send had a (different, minimal) footer — divergence between
// preview and send is the most insidious form of this bug.

import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { renderNewsletterEmail } from '../../../../lib/newsletter-template';
import { countSentCampaigns } from '../../../../lib/newsletter-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { subject?: string; html_body?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const subject = String(body.subject ?? '').trim() || '(ohne Betreff)';
  const rawHtml = String(body.html_body ?? '').trim();

  // Match the substitution the send path performs — preview must be 1:1.
  let ausgabe = '01';
  try {
    const sentCount = await countSentCampaigns();
    ausgabe = String(sentCount + 1).padStart(2, '0');
  } catch {
    // DB unavailable in dev or tests: fall back to '01' so the preview still renders.
  }
  const renderedBody = rawHtml.replace(/\{\{AUSGABE\}\}/g, ausgabe);

  const prodDomain = process.env.PROD_DOMAIN || '';
  const baseUrl = prodDomain ? `https://web.${prodDomain}` : 'http://web.localhost';
  const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=PREVIEW`;

  const html = renderNewsletterEmail({
    bodyHtml: renderedBody,
    subject,
    unsubscribeUrl,
    isPreview: true,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Prevent any caching — preview must reflect the current draft.
      'Cache-Control': 'no-store',
    },
  });
};
