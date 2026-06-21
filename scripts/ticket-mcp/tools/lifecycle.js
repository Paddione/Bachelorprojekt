import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerLifecycleTools(server) {
  server.tool(
    'transition_status',
    'Ändert den Status eines Tickets. Bei done/archived ist resolution erforderlich.',
    {
      id: z.string(),
      brand: z.string().optional(),
      status: z.enum([
        'triage', 'planning', 'plan_staged', 'backlog',
        'in_progress', 'in_review', 'qa_review', 'blocked',
        'awaiting_deploy', 'done', 'archived',
      ]),
      resolution: z.enum(['fixed', 'shipped', 'obsolete']).optional(),
      notes: z.string().optional(),
    },
    async ({ id, brand = 'mentolder', status, resolution, notes }) => {
      const args = ['update-status', '--id', id, '--status', status];
      if (resolution) args.push('--resolution', resolution);
      if (notes)      args.push('--notes', notes);
      const raw = await runTicket(args, { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'add_comment',
    'Fügt einem Ticket einen Kommentar hinzu.',
    {
      id: z.string(),
      brand: z.string().optional(),
      body: z.string().describe('Kommentartext (Markdown)'),
      author: z.string().optional().describe('default: claude-code'),
      visibility: z.enum(['internal', 'public']).optional().describe('default: internal'),
    },
    async ({ id, brand = 'mentolder', body, author = 'claude-code', visibility = 'internal' }) => {
      const raw = await runTicket(
        ['add-comment', '--id', id, '--body', body, '--author', author, '--visibility', visibility],
        { BRAND: brand }
      );
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'update_fields',
    'Bulk-Patch: ändert title, description oder notes eines Tickets.',
    {
      id: z.string(),
      brand: z.string().optional(),
      notes: z.string().optional().describe('Wird an bestehende notes angehängt'),
    },
    async ({ id, brand = 'mentolder', notes }) => {
      if (!notes) {
        return { content: [{ type: 'text', text: 'Keine Felder zum Aktualisieren angegeben.' }] };
      }
      const raw = await runTicket(
        ['add-comment', '--id', id, '--body', notes, '--author', 'ticket-mcp', '--visibility', 'internal'],
        { BRAND: brand }
      );
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );
}
