import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerPlanningTools(server) {
  server.tool(
    'set_plan_meta',
    'Setzt Planungs-Metadaten: value_prop, effort, areas, depends_on, planning_rank.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional(),
      value_prop: z.string().optional().describe('Kern-Nutzen des Features'),
      effort: z.enum(['klein', 'mittel', 'gross']).optional(),
      areas: z.string().optional().describe('Komma-separierte Bereiche z.B. auth,chat'),
      depends_on: z.string().optional().describe('Komma-separierte Ticket-IDs z.B. T000100,T000101'),
      rank: z.number().int().optional().describe('Planungs-Rang (niedrig = höhere Prio)'),
    },
    async ({ id, brand = 'mentolder', value_prop, effort, areas, depends_on, rank }) => {
      const args = ['plan-meta', 'set', '--id', id];
      if (value_prop) args.push('--value-prop', value_prop);
      if (effort)     args.push('--effort', effort);
      if (areas)      args.push('--areas', areas);
      if (depends_on) args.push('--depends-on', depends_on);
      if (rank != null) args.push('--rank', String(rank));

      const raw = await runTicket(args, { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'set_readiness_flag',
    'Setzt ein einzelnes Readiness-Flag (spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt, lastenheft_locked).',
    {
      id: z.string(),
      brand: z.string().optional(),
      flag: z.enum([
        'spec_skizziert',
        'abhaengigkeiten_klar',
        'offene_fragen_geklaert',
        'aufwand_geschaetzt',
        'lastenheft_locked',
      ]),
      value: z.boolean(),
    },
    async ({ id, brand = 'mentolder', flag, value }) => {
      const readiness = `${flag}=${value}`;
      const raw = await runTicket(
        ['plan-meta', 'set', '--id', id, '--readiness', readiness],
        { BRAND: brand }
      );
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );
}
