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

  server.tool(
    'prepare_feature',
    'Convenience: setzt alle Pflichtfelder für ein Feature-Ticket in einem Call und transitioniert zu planning. ' +
    'Führt intern set_plan_meta + alle Readiness-Flags + transition_status(planning) aus.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional(),
      priority: z.enum(['hoch', 'mittel', 'niedrig']).optional(),
      severity: z.enum(['critical', 'major', 'minor', 'trivial']).optional(),
      attention_mode: z.enum(['auto', 'ai_ready', 'needs_human']).optional(),
      value_prop: z.string().optional(),
      effort: z.enum(['klein', 'mittel', 'gross']).optional(),
      areas: z.string().optional(),
      depends_on: z.string().optional(),
      spec_skizziert: z.boolean().optional(),
      abhaengigkeiten_klar: z.boolean().optional(),
      offene_fragen_geklaert: z.boolean().optional(),
      aufwand_geschaetzt: z.boolean().optional(),
    },
    async ({ id, brand = 'mentolder', priority, severity, attention_mode,
             value_prop, effort, areas, depends_on,
             spec_skizziert, abhaengigkeiten_klar,
             offene_fragen_geklaert, aufwand_geschaetzt }) => {
      const log = [];
      const env = { BRAND: brand };

      const metaArgs = ['plan-meta', 'set', '--id', id];
      if (value_prop) metaArgs.push('--value-prop', value_prop);
      if (effort)     metaArgs.push('--effort', effort);
      if (areas)      metaArgs.push('--areas', areas);
      if (depends_on) metaArgs.push('--depends-on', depends_on);
      if (metaArgs.length > 4) {
        const r = await runTicket(metaArgs, env).catch(e => `FEHLER plan-meta: ${e.message}`);
        log.push(r.trim?.() ?? r);
      }

      const flags = { spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt };
      for (const [flag, val] of Object.entries(flags)) {
        if (val == null) continue;
        const r = await runTicket(
          ['plan-meta', 'set', '--id', id, '--readiness', `${flag}=${val}`],
          env
        ).catch(e => `FEHLER readiness ${flag}: ${e.message}`);
        log.push(r.trim?.() ?? r);
      }

      const statusArgs = ['update-status', '--id', id, '--status', 'planning'];
      if (attention_mode) {
        const r = await runTicket(
          ['inject', '--id', id, '--fields', `attention_mode=${attention_mode}`],
          env
        ).catch(e => `FEHLER attention_mode: ${e.message}`);
        log.push(r.trim?.() ?? r);
      }
      const r = await runTicket(statusArgs, env).catch(e => `FEHLER status: ${e.message}`);
      log.push(r.trim?.() ?? r);

      return { content: [{ type: 'text', text: log.filter(Boolean).join('\n') }] };
    }
  );
}
