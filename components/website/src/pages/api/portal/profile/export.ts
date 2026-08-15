import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { collectCustomerDsgvoData } from '../../../../lib/customer-crm-db';

export const GET: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await collectCustomerDsgvoData(session.sub).catch((e) => {
    locals.requestLogger.error({ e }, '[profile/export] db error'); return null;
  });
  if (!data) {
    return new Response(JSON.stringify({ error: 'Export fehlgeschlagen.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    identity: { name: session.name, email: session.email },
    ...data,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="meine-daten.json"',
    },
  });
};
