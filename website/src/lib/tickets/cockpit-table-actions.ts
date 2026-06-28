// Pure async mutation helpers for the Projekt-Cockpit table.
// S2-safe: imports types only — never the store, never UI components.
// NOTE: the transition endpoint reads `status` (verified in Task 0 Step 2);
// if it ever reads `newStatus`, change ONLY the body key below.
import type { TicketRow } from './cockpit-types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// `resolution` is REQUIRED by the server for status=done|archived (transition.ts).
// Without it the call 400s and the optimistic update rolls back — that was the
// reason a ticket could not be closed from the cockpit. Callers pass a sensible
// default via defaultResolutionFor(type).
export async function transitionTicket(
  id: string, status: string, resolution?: string): Promise<boolean> {
  const body: Record<string, string> = { status };
  if (resolution) body.resolution = resolution;
  const res = await fetch(`/api/admin/tickets/${id}/transition`, {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function patchPriority(id: string, priority: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ priority }),
  });
  return res.ok;
}

async function patchTitle(id: string, title: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ title }),
  });
  return res.ok;
}

async function patchDescription(id: string, description: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ description }),
  });
  return res.ok;
}

export async function reorderTickets(ordered: TicketRow[]): Promise<boolean> {
  const updates = ordered.map((t, i) => ({ ticketId: t.id, planningRank: i }));
  const res = await fetch('/api/admin/cockpit/reorder', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ updates }),
  });
  return res.ok;
}

export async function runBatch(
  ticketIds: string[], mutation: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/admin/cockpit/batch', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ ticketIds, mutation }),
  });
  return res.ok;
}

interface CreatePayload {
  type: string; title: string; priority: string;
  description?: string; component?: string; parentId?: string;
}
interface CreateResult { ok: boolean; body?: unknown; error?: string; }

export async function createTicket(p: CreatePayload): Promise<CreateResult> {
  const res = await fetch('/api/admin/tickets', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({
      type: p.type, title: p.title.trim(), priority: p.priority,
      description: p.description?.trim() || undefined,
      component: p.component?.trim() || undefined,
      parentId: p.parentId || undefined,
    }),
  });
  let body: unknown; try { body = await res.json(); } catch { body = undefined; }
  if (!res.ok) {
    const err = (body as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
    return { ok: false, error: err };
  }
  return { ok: true, body };
}

export async function bulkStatusChange(
  ticketIds: string[], status: string): Promise<{ ok: boolean; body?: Record<string, unknown> }> {
  const res = await fetch('/api/admin/tickets/bulk-status', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ ticketIds, status }),
  });
  let body: Record<string, unknown> | undefined;
  try { body = await res.json(); } catch { body = undefined; }
  return { ok: res.ok, body };
}

export async function undoBulkStatus(
  undoToken: string): Promise<{ ok: boolean; body?: Record<string, unknown> }> {
  const res = await fetch('/api/admin/tickets/bulk-status/undo', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ undoToken }),
  });
  let body: Record<string, unknown> | undefined;
  try { body = await res.json(); } catch { body = undefined; }
  return { ok: res.ok, body };
}
