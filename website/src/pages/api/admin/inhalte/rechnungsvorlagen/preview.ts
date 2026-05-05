import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getSiteSetting } from '../../../../../lib/website-db';
import { renderInvoiceHtml, renderDunningHtml, sampleInvoiceForPreview } from '../../../../../lib/invoice-html';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

function logoDataUrl(): string | null {
  const candidates = [
    join(process.cwd(), 'src/assets/icon-128.png'),
    join(dirname(fileURLToPath(import.meta.url)), '../../../../assets/icon-128.png'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        return `data:image/png;base64,${readFileSync(p).toString('base64')}`;
      }
    } catch { /* try next */ }
  }
  return null;
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const brand = process.env.BRAND || 'mentolder';
  const [intro, kleinNotice, outro] = await Promise.all([
    getSiteSetting(brand, 'invoice_intro_text'),
    getSiteSetting(brand, 'invoice_kleinunternehmer_notice'),
    getSiteSetting(brand, 'invoice_outro_text'),
  ]);
  const templateTexts = {
    introText: intro ?? undefined,
    kleinunternehmerNotice: kleinNotice ?? undefined,
    outroText: outro ?? undefined,
  };

  const kind = url.searchParams.get('kind') ?? 'invoice';
  const sample = sampleInvoiceForPreview(templateTexts);
  const opts = { logoDataUrl: logoDataUrl(), brandName: process.env.BRAND_NAME ?? 'mentolder' };

  let html: string;
  if (kind === 'dunning1' || kind === 'dunning2') {
    const level = kind === 'dunning1' ? 1 : 2;
    html = renderDunningHtml({
      dunning: {
        id: 'preview', invoiceId: sample.invoice.id, brand, level,
        generatedAt: new Date().toISOString(),
        feeAmount: level === 2 ? 5 : 0,
        interestAmount: level === 2 ? 2.34 : 0,
        outstandingAtGeneration: sample.invoice.grossAmount,
      },
      invoice: sample.invoice, customer: sample.customer, seller: sample.seller,
    }, opts);
  } else {
    html = renderInvoiceHtml(sample, opts);
  }

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
