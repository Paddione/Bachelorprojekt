import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getInvoiceForEInvoice } from '../../../../../lib/native-billing';
import { generateEInvoiceXml, type EInvoiceProfile } from '../../../../../lib/einvoice-profile';

const PROFILES: Record<EInvoiceProfile, { contentType: string; prefix: string }> = {
  'factur-x-minimum': { contentType: 'application/xml; charset=utf-8',  prefix: 'factur-x' },
  'xrechnung-cii':    { contentType: 'application/xml; charset=utf-8',  prefix: 'xrechnung-cii' },
  'xrechnung-ubl':    { contentType: 'application/xml; charset=utf-8',  prefix: 'xrechnung-ubl' },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json(401, { error: 'Unauthorized' });
  const id = params.id;
  if (!id) return json(400, { error: 'Missing invoice ID' });

  const url = new URL(request.url);
  const profileParam = (url.searchParams.get('profile') ?? 'factur-x-minimum') as EInvoiceProfile;
  if (!(profileParam in PROFILES)) return json(400, { error: `Unknown profile: ${profileParam}` });

  const data = await getInvoiceForEInvoice(id);
  if (!data) return json(404, { error: 'Invoice not found' });

  let xml: string;
  try {
    xml = generateEInvoiceXml(profileParam, data);
  } catch (e) {
    return json(422, { error: (e as Error).message });
  }

  const meta = PROFILES[profileParam];
  const filename = `${meta.prefix}-${data.invoice.number || id}.xml`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': meta.contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
