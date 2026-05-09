// Admin nudge evaluators. Every query is wrapped in safeQuery so a missing
// table downgrades to a one-time console.warn instead of crashing the
// /api/assistant/nudges endpoint.

import { registerTrigger } from '../triggers';
import { pool } from '../../website-db';
import type { Nudge } from '../types';

const warned = new Set<string>();

async function safeQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[],
  hintTable: string,
): Promise<{ rows: T[] } | null> {
  try {
    return await pool.query<T>(sql, params);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '42P01') {
      if (!warned.has(hintTable)) {
        warned.add(hintTable);
        console.warn(`[assistant.triggers.admin] table ${hintTable} not found — trigger disabled until schema lands`);
      }
      return null;
    }
    throw err;
  }
}

// 1. Morning briefing — fires once on /admin or /admin/dashboard.
//    Snooze handled by /api/assistant/dismiss (caller sets snoozeSeconds=86400).
registerTrigger({
  id: 'admin-morning-briefing',
  profile: 'admin',
  async evaluate({ currentRoute }) {
    if (!/^\/admin\/?(dashboard\/?)?$/.test(currentRoute)) return null;

    const meetings = await safeQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM meetings
         WHERE status IN ('scheduled', 'transcribed')
           AND scheduled_at >= date_trunc('day', now())
           AND scheduled_at <  date_trunc('day', now()) + interval '1 day'`,
      [],
      'meetings',
    );
    const tickets = await safeQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM tickets.tickets
         WHERE status NOT IN ('done', 'archived')`,
      [],
      'tickets.tickets',
    );

    const meetingsCount = Number(meetings?.rows[0]?.count ?? 0);
    const ticketsCount = Number(tickets?.rows[0]?.count ?? 0);
    if (meetingsCount === 0 && ticketsCount === 0) return null;

    const nudge: Nudge = {
      id: 'admin-morning-briefing',
      triggerId: 'admin-morning-briefing',
      profile: 'admin',
      headline: 'Heute',
      body: `${meetingsCount} Termine, ${ticketsCount} offene Tickets.`,
      primaryAction: { label: 'Durchgehen', kickoff: 'Geh meine offenen Tickets der Reihe nach durch' },
      secondaryAction: { label: 'Später', kickoff: '' },
      createdAt: new Date().toISOString(),
    };
    return nudge;
  },
});

// 2. Term in 5 min — meeting starting in 0–6 minutes.
registerTrigger({
  id: 'admin-meeting-imminent',
  profile: 'admin',
  async evaluate() {
    const r = await safeQuery<{ id: string; client_name: string | null }>(
      `SELECT m.id, c.name AS client_name
         FROM meetings m
         LEFT JOIN customers c ON c.id = m.customer_id
         WHERE m.scheduled_at BETWEEN now() AND now() + interval '6 minutes'
           AND m.status = 'scheduled'
         ORDER BY m.scheduled_at ASC LIMIT 1`,
      [],
      'meetings',
    );
    const row = r?.rows[0];
    if (!row) return null;
    const name = row.client_name ?? 'Ein Klient';
    return {
      id: `admin-meeting-imminent:${row.id}`,
      triggerId: 'admin-meeting-imminent',
      profile: 'admin',
      headline: 'Termin in 5 min',
      body: `${name} — beitreten?`,
      primaryAction: { label: 'Beitreten', kickoff: `Öffne den Meetingraum für ${name}` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 3. New Fragebogen submitted (last 5 minutes).
registerTrigger({
  id: 'admin-fragebogen-submitted',
  profile: 'admin',
  async evaluate() {
    const r = await safeQuery<{ id: string; client_name: string | null; template_title: string | null }>(
      `SELECT a.id, c.name AS client_name, t.title AS template_title
         FROM questionnaire_assignments a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN questionnaire_templates t ON t.id = a.template_id
         WHERE a.status = 'submitted'
           AND a.submitted_at >= now() - interval '5 minutes'
         ORDER BY a.submitted_at DESC LIMIT 1`,
      [],
      'questionnaire_assignments',
    );
    const row = r?.rows[0];
    if (!row) return null;
    const name = row.client_name ?? 'Ein Klient';
    const title = row.template_title ?? 'Fragebogen';
    return {
      id: `admin-fragebogen-submitted:${row.id}`,
      triggerId: 'admin-fragebogen-submitted',
      profile: 'admin',
      headline: 'Neuer Fragebogen',
      body: `${name} hat „${title}" abgeschickt.`,
      primaryAction: { label: 'Antworten sehen', kickoff: `Zeig mir die letzten Antworten von ${name}` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 4. Payment received (last 5 minutes).
//    Uses created_at on billing_invoice_payments (TIMESTAMPTZ); paid_at is DATE-precision.
registerTrigger({
  id: 'admin-payment-received',
  profile: 'admin',
  async evaluate() {
    const r = await safeQuery<{
      id: string;
      amount: number | string;
      payer: string | null;
      invoice_number: string | null;
    }>(
      `SELECT p.id, p.amount, bc.name AS payer, i.number AS invoice_number
         FROM billing_invoice_payments p
         LEFT JOIN billing_invoices i ON i.id = p.invoice_id
         LEFT JOIN billing_customers bc ON bc.id = i.customer_id
         WHERE p.created_at >= now() - interval '5 minutes'
         ORDER BY p.created_at DESC LIMIT 1`,
      [],
      'billing_invoice_payments',
    );
    const row = r?.rows[0];
    if (!row) return null;
    const amount = (typeof row.amount === 'string' ? Number(row.amount) : row.amount).toFixed(2);
    const payer = row.payer ?? 'Klient';
    const num = row.invoice_number ? ` (Rg. ${row.invoice_number})` : '';
    return {
      id: `admin-payment-received:${row.id}`,
      triggerId: 'admin-payment-received',
      profile: 'admin',
      headline: 'Zahlung eingegangen',
      body: `${amount} € von ${payer}${num}.`,
      primaryAction: { label: 'Quittung versenden', kickoff: `Versende die Quittung für die letzte Zahlung von ${payer}` },
      createdAt: new Date().toISOString(),
    };
  },
});
