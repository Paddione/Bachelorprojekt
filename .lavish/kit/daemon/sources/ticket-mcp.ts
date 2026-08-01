import { exec } from '../lib/exec';

export interface TicketSummary { id: string; title: string; status: string; priority: string; epic: string | null; }

/**
 * T002505: Defense in Depth neben dem argv-Aufbau. Ticket-IDs im Repo haben die
 * Form T + sechs Ziffern (T002505). Alles andere wird abgewiesen, bevor es
 * ueberhaupt in einen Prozessaufruf geraet.
 *
 * Dieser Sink stand NICHT im automatischen Security-Report — er kam beim
 * Nachziehen aller exec()-Aufrufer ans Licht. `?extId=` von
 * /api/admin/cockpit/feature floss unveraendert in den Kommandostring, und die
 * Route haengt an keiner Auth-Middleware.
 */
export function isValidExtId(extId: string): boolean {
  return /^T\d{6}$/.test(extId);
}

export async function getTickets(): Promise<TicketSummary[]> {
  const r = await exec('bash', [
    'scripts/ticket-mcp.sh', 'export',
    '--status', 'triage,planning,plan_staged,backlog,in_progress',
    '--limit', '50',
  ], 10000);
  if (!r.ok) throw new Error(`ticket-mcp: ${r.error}`);
  try {
    const tickets = JSON.parse(r.stdout);
    return tickets.map((t:any) => ({ id: t.external_id||t.id, title: t.title, status: t.status, priority: t.priority||'mittel', epic: t.epic||null }));
  } catch { throw new Error('ticket-mcp: invalid JSON'); }
}

export async function getTicketDetail(extId: string): Promise<TicketSummary | null> {
  if (!isValidExtId(extId)) throw new Error(`invalid ticket id: ${JSON.stringify(extId)}`);
  const r = await exec('bash', ['scripts/ticket-mcp.sh', 'get', extId], 5000);
  if (!r.ok) throw new Error(`ticket-mcp get: ${r.error}`);
  try { const t = JSON.parse(r.stdout); return { id: t.external_id||t.id, title: t.title, status: t.status, priority: t.priority||'mittel', epic: t.epic||null }; }
  catch { return null; }
}
