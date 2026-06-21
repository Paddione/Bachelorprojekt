import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerListTools(server) {
  server.tool(
    'list_tickets',
    'Listet Tickets gefiltert nach Status, Typ, Brand oder fehlender ID.',
    {
      brand: z.string().optional().describe('mentolder oder korczewski (default: mentolder)'),
      status: z.string().optional().describe('z.B. triage, planning, plan_staged, backlog'),
      type: z.string().optional().describe('bug, feature, task, project'),
      attention_mode: z.string().optional().describe('auto, ai_ready, needs_human'),
      missing_id: z.boolean().optional().describe('Nur Tickets ohne external_id zurückgeben'),
    },
    async ({ brand = 'mentolder', status, type, attention_mode, missing_id }) => {
      const args = ['list', '--brand', brand];
      if (status) args.push('--status', status);
      if (type) args.push('--type', type);
      if (attention_mode) args.push('--attention-mode', attention_mode);
      if (missing_id) args.push('--missing-id');

      const raw = await runTicket(args, { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'get_ticket',
    'Gibt vollständige Details eines Tickets per external_id zurück.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional().describe('mentolder oder korczewski (default: mentolder)'),
    },
    async ({ id, brand = 'mentolder' }) => {
      const raw = await runTicket(['get', '--id', id], { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'export_tickets',
    'Exportiert Tickets als JSON oder Markdown (gleiche Filter wie list_tickets).',
    {
      brand: z.string().optional(),
      status: z.string().optional(),
      type: z.string().optional(),
      format: z.enum(['json', 'markdown']).optional().describe('json (default) oder markdown'),
    },
    async ({ brand = 'mentolder', status, type, format = 'json' }) => {
      const args = ['list', '--brand', brand];
      if (status) args.push('--status', status);
      if (type) args.push('--type', type);

      const raw = await runTicket(args, { BRAND: brand });

      if (format === 'markdown') {
        const tickets = JSON.parse(raw.trim());
        const md = tickets.map(t =>
          `- **${t.external_id ?? '(kein ID)'}** [${t.status}] ${t.title}`
        ).join('\n');
        return { content: [{ type: 'text', text: md || '_(keine Tickets)_' }] };
      }

      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );
}
