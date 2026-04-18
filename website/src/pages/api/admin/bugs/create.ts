import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { insertBugTicket } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';
const VALID_CATEGORIES = new Set(['fehler', 'verbesserung', 'erweiterungswunsch']);

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateTicketId(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `BR-${today}-${rand}`;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return jsonError('Nicht autorisiert', 401);
  }

  let body: { description?: unknown; category?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Ungültiger JSON-Body', 400);
  }

  const description = (typeof body.description === 'string' ? body.description : '').trim();
  const category = (typeof body.category === 'string' ? body.category : '').trim();

  if (!description) {
    return jsonError('Beschreibung ist erforderlich', 400);
  }
  if (description.length > 2000) {
    return jsonError('Beschreibung zu lang (max. 2000 Zeichen)', 400);
  }
  if (!VALID_CATEGORIES.has(category)) {
    return jsonError('Ungültige Kategorie', 400);
  }

  const ticketId = generateTicketId();

  try {
    await insertBugTicket({
      ticketId,
      category,
      reporterEmail: session.email,
      description,
      url: '/admin/monitoring',
      brand: BRAND,
    });
  } catch (err) {
    console.error('[bugs/create] DB error:', err);
    return jsonError('Datenbankfehler', 500);
  }

  return new Response(JSON.stringify({ ticketId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
