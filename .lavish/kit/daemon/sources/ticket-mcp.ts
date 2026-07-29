import { exec } from '../lib/exec';

export interface TicketSummary { id: string; title: string; status: string; priority: string; epic: string | null; }

export async function getTickets(): Promise<TicketSummary[]> {
  const r = await exec('bash scripts/ticket-mcp.sh export --status triage,planning,plan_staged,backlog,in_progress --limit 50', 10000);
  if (!r.ok) throw new Error(`ticket-mcp: ${r.error}`);
  try {
    const tickets = JSON.parse(r.stdout);
    return tickets.map((t:any) => ({ id: t.external_id||t.id, title: t.title, status: t.status, priority: t.priority||'mittel', epic: t.epic||null }));
  } catch { throw new Error('ticket-mcp: invalid JSON'); }
}

export async function getTicketDetail(extId: string): Promise<TicketSummary | null> {
  const r = await exec(`bash scripts/ticket-mcp.sh get ${extId}`, 5000);
  if (!r.ok) throw new Error(`ticket-mcp get: ${r.error}`);
  try { const t = JSON.parse(r.stdout); return { id: t.external_id||t.id, title: t.title, status: t.status, priority: t.priority||'mittel', epic: t.epic||null }; }
  catch { return null; }
}
