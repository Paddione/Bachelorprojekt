import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';
import { readBuffer, writeBuffer, classifyBundle } from '../lib/mishap-buffer.js';

const MISHAP_TRIGGER = 3;

const MISHAP_TYPE = z.enum(['broken', 'degraded', 'suspicious', 'security', 'drift', 'process']);

async function createBundleTicket(bundle, brand) {
  const classified = classifyBundle(bundle);
  const result = await runTicket([
    'create',
    '--type',           'task',
    '--brand',          brand,
    '--title',          classified.title,
    '--description',    classified.description,
    '--status',         'triage',
    '--severity',       classified.severity,
    '--priority',       classified.priority,
    '--attention-mode', 'ai_ready',
    '--areas',          classified.areas,
  ], { BRAND: brand });
  return result.trim().split('|')[0];
}

export function registerMishapTools(server) {
  server.tool(
    'report_mishap',
    `Fügt einen Mishap in den Buffer ein. Bei ≥${MISHAP_TRIGGER} Einträgen wird automatisch ein gebündeltes Ticket mit attention_mode=ai_ready angelegt.`,
    {
      title:       z.string().describe('Kurztitel des Mishaps'),
      description: z.string().describe('Ausführliche Beschreibung'),
      component:   z.string().describe('Betroffene Komponente z.B. auth, chat, infra'),
      type:        MISHAP_TYPE.describe('Mishap-Typ (broken/security → severity major; process → Prozessbeobachtung)'),
      brand:       z.string().optional(),
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
      let extId;
      try {
        extId = await createBundleTicket(bundle, brand);
      } catch (err) {
        writeBuffer(buffer);
        throw err;
      }

      writeBuffer(buffer.slice(MISHAP_TRIGGER));

      return {
        content: [{
          type: 'text',
          text: `Bundle-Ticket angelegt: ${extId}\nBuffer geleert. Verbleibende Mishaps: ${buffer.length - MISHAP_TRIGGER}\n\nTicket landet im nächsten Factory-Tick (attention_mode=ai_ready).`,
        }],
      };
    }
  );

  server.tool(
    'get_mishap_buffer',
    'Zeigt den aktuellen Inhalt des Mishap-Buffers an (noch nicht zu Tickets gebündelt).',
    {},
    () => {
      const buffer = readBuffer();
      if (buffer.length === 0) {
        return { content: [{ type: 'text', text: 'Mishap-Buffer ist leer.' }] };
      }
      const lines = buffer.map((e, i) =>
        `${i + 1}. [${e.type}] ${e.title} (${e.component}) — ${e.reported_at}`
      );
      return {
        content: [{
          type: 'text',
          text: `Buffer: ${buffer.length}/${MISHAP_TRIGGER} Einträge\n\n${lines.join('\n')}`,
        }],
      };
    }
  );

  server.tool(
    'flush_mishap_buffer',
    'Erzwingt die Erstellung eines Bundle-Tickets aus dem aktuellen Buffer — auch bei weniger als 3 Einträgen. Nützlich am Ende einer Session.',
    {
      brand: z.string().optional(),
    },
    async ({ brand = 'mentolder' }) => {
      const buffer = readBuffer();
      if (buffer.length === 0) {
        return { content: [{ type: 'text', text: 'Mishap-Buffer ist leer — nichts zu flushen.' }] };
      }

      let extId;
      try {
        extId = await createBundleTicket(buffer, brand);
      } catch (err) {
        throw err;
      }

      writeBuffer([]);

      return {
        content: [{
          type: 'text',
          text: `Bundle-Ticket angelegt: ${extId} (${buffer.length} Mishap${buffer.length !== 1 ? 's' : ''})\nBuffer geleert.`,
        }],
      };
    }
  );
}
