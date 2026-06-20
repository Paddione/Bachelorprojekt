import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { runTriage } from '../../../../../lib/ticket-triage';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  try {
    const result = await runTriage(id, BRAND());
    if (!result) {
      return new Response(JSON.stringify({ error: 'Triage nicht durchfuehrbar (Ticket nicht gefunden oder leer)' }), { status: 404 });
    }
    return new Response(JSON.stringify({
      ticket_id: id,
      priority: result.priority,
      severity: result.severity,
      component: result.component,
      reasoning: result.reasoning,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/tickets/[id]/triage]');
    return new Response(JSON.stringify({ error: 'Triage fehlgeschlagen' }), { status: 500 });
  }
};
