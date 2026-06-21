import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';
import { readBuffer, writeBuffer, classifyBundle, DEFAULT_BUFFER_PATH } from '../lib/mishap-buffer.js';

const MISHAP_TRIGGER = 3;

export function registerMishapTools(server) {
  server.tool(
    'report_mishap',
    `Fügt einen Mishap in den Buffer ein. Bei ≥${MISHAP_TRIGGER} Einträgen wird automatisch ein gebündeltes Ticket mit attention_mode=ai_ready angelegt.`,
    {
      title: z.string().describe('Kurztitel des Mishaps'),
      description: z.string().describe('Ausführliche Beschreibung'),
      component: z.string().describe('Betroffene Komponente z.B. auth, chat, infra'),
      type: z.enum(['broken', 'degraded', 'suspicious', 'security', 'drift'])
        .describe('Mishap-Typ (broken/security → severity major)'),
      brand: z.string().optional(),
    },
    async ({ title, description, component, type, brand = 'mentolder' }) => {
      const entry = {
        title, description, component, type,
        reported_at: new Date().toISOString(),
      };

      const buffer = readBuffer();
      buffer.push(entry);

      if (buffer.length < MISHAP_TRIGGER) {
        writeBuffer(buffer);
        return {
          content: [{
            type: 'text',
            text: `Mishap gespeichert (${buffer.length}/${MISHAP_TRIGGER}). Noch ${MISHAP_TRIGGER - buffer.length} bis zum automatischen Bundle-Ticket.`,
          }],
        };
      }

      const bundle = buffer.slice(0, MISHAP_TRIGGER);
      const classified = classifyBundle(bundle);

      let ticketResult;
      try {
        ticketResult = await runTicket([
          'create',
          '--type',     'task',
          '--brand',    brand,
          '--title',    classified.title,
          '--description', classified.description,
          '--status',   'triage',
          '--severity', classified.severity,
          '--priority', classified.priority,
          '--attention-mode', 'ai_ready',
          '--areas',    classified.areas,
        ], { BRAND: brand });
      } catch (err) {
        writeBuffer(buffer);
        throw err;
      }

      writeBuffer(buffer.slice(MISHAP_TRIGGER));

      const extId = ticketResult.trim().split('|')[0];
      return {
        content: [{
          type: 'text',
          text: `Bundle-Ticket angelegt: ${extId}\nBuffer geleert. Verbleibende Mishaps: ${buffer.length - MISHAP_TRIGGER}\n\nTicket landet im nächsten Factory-Tick (attention_mode=ai_ready).`,
        }],
      };
    }
  );
}
