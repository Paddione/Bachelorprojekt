import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerTriageTools(server) {
  server.tool(
    'triage_ticket',
    'Setzt Triage-Felder eines Tickets: type, severity, priority, attention_mode, status.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional(),
      type: z.enum(['bug', 'feature', 'task', 'project']).optional(),
      severity: z.enum(['critical', 'major', 'minor', 'trivial']).optional(),
      priority: z.enum(['hoch', 'mittel', 'niedrig']).optional(),
      attention_mode: z.enum(['auto', 'ai_ready', 'needs_human']).optional(),
      status: z.string().optional().describe('Ziel-Status z.B. triage, planning, backlog'),
    },
    async ({ id, brand = 'mentolder', type, severity, priority, attention_mode, status = 'triage' }) => {
      const args = ['triage', '--id', id, '--status', status, '--apply', '--no-comment'];
      if (priority)       args.push('--priority', priority);
      if (severity)       args.push('--severity', severity);
      if (type)           args.push('--type', type);
      if (attention_mode) args.push('--attention-mode', attention_mode);

      const raw = await runTicket(args, { BRAND: brand, VDA_NONINTERACTIVE: '1' });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'backfill_ticket_id',
    'Findet Tickets ohne external_id (T-Nummer) und setzt die nächste Sequenznummer.',
    {
      brand: z.string().optional().describe('mentolder oder korczewski (default: mentolder)'),
    },
    async ({ brand = 'mentolder' }) => {
      const raw = await runTicket(['backfill-id', '--brand', brand], { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() || 'Keine Tickets ohne ID gefunden.' }] };
    }
  );
}
