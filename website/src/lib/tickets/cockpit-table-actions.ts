// Pure async mutation helpers for the Projekt-Cockpit table.
// S2-safe: imports types only — never the store, never UI components.
// NOTE: the transition endpoint reads `status` (verified in Task 0 Step 2);
// if it ever reads `newStatus`, change ONLY the body key below.
import type { TicketRow } from './cockpit-types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function transitionTicket(id: string, status: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}/transition`, {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ status }),
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

export async function patchTitle(id: string, title: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ title }),
  });
  return res.ok;
}

export async function patchDescription(id: string, description: string): Promise<boolean> {
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

export interface CreatePayload {
  type: string; title: string; priority: string;
  description?: string; component?: string; parentId?: string;
}
export interface CreateResult { ok: boolean; body?: unknown; error?: string; }

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
