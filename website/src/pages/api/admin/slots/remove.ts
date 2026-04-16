import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { removeSlotFromWhitelist } from '../../../../lib/website-db';

const BRAND = process.env.BRAND_NAME || 'mentolder';

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let slotStart: string;
  try {
    ({ slotStart } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!slotStart) {
    return new Response(JSON.stringify({ error: 'slotStart erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const start = new Date(slotStart);
  if (isNaN(start.getTime())) {
    return new Response(JSON.stringify({ error: 'Ungültiges Datumsformat' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await removeSlotFromWhitelist(BRAND, start);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/slots/remove]', err);
    return new Response(JSON.stringify({ error: 'Datenbankfehler' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
