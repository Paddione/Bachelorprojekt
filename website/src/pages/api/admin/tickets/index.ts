// website/src/pages/api/admin/tickets/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  listAdminTickets, countAdminTickets, createAdminTicket,
  type ListFilters, type TicketType, type TicketPriority, type TicketSeverity,
} from '../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const sp = url.searchParams;
  const filters: ListFilters = {
    brand: BRAND(),
    type:        (sp.get('type')        as TicketType)        ?? undefined,
    status:      (sp.get('status')      as ListFilters['status']) ?? undefined,
    attention:   (sp.get('attention')   as ListFilters['attention']) ?? undefined,
    component:   sp.get('component')    ?? undefined,
    assigneeId:  sp.get('assigneeId')   ?? undefined,
    customerId:  sp.get('customerId')   ?? undefined,
    thesisTag:   sp.get('thesisTag')    ?? undefined,
    tagName:     sp.get('tag')          ?? undefined,
    q:           sp.get('q')            ?? undefined,
    parentIsNull: sp.get('flat') === '1' ? false : true,
    limit:  Number(sp.get('limit')  ?? 100),
    offset: Number(sp.get('offset') ?? 0),
  };
  const [items, total] = await Promise.all([
    listAdminTickets(filters), countAdminTickets(filters),
  ]);
  return new Response(JSON.stringify({ items, total }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const type = body.type as TicketType;
  if (!type || !['feature','task','project'].includes(type)) {
    return new Response(JSON.stringify({
      error: 'type must be feature|task|project (bugs are minted via /api/bug-report)',
    }), { status: 400 });
  }
  const title = String(body.title ?? '').trim();
  if (!title) return new Response(JSON.stringify({ error: 'title is required' }), { status: 400 });

  try {
    const id = await createAdminTicket({
      brand: BRAND(),
      type,
      title,
      description:    typeof body.description === 'string' ? body.description : undefined,
      parentId:       typeof body.parentId    === 'string' ? body.parentId    : undefined,
      customerId:     typeof body.customerId  === 'string' ? body.customerId  : undefined,
      assigneeId:     typeof body.assigneeId  === 'string' ? body.assigneeId  : undefined,
      reporterEmail:  typeof body.reporterEmail === 'string' ? body.reporterEmail : undefined,
      priority:       body.priority as TicketPriority | undefined,
      severity:       body.severity as TicketSeverity | undefined,
      component:      typeof body.component  === 'string' ? body.component  : undefined,
      thesisTag:      typeof body.thesisTag  === 'string' ? body.thesisTag  : undefined,
      externalId:     typeof body.externalId === 'string' ? body.externalId : undefined,
      startDate:      typeof body.startDate  === 'string' ? body.startDate  : undefined,
      dueDate:        typeof body.dueDate    === 'string' ? body.dueDate    : undefined,
      estimateMinutes: typeof body.estimateMinutes === 'number' ? body.estimateMinutes : undefined,
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'create failed';
    console.error('[api/admin/tickets POST]', err);
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }
};
