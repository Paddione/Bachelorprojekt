// Portal nudge evaluators. User-scoping always goes through
// customers.keycloak_user_id = $userSub since per-user tables here
// reference customers.id (UUID), not the keycloak sub directly.
//
// Every query is wrapped in safeQuery so a missing table downgrades to a
// one-time console.warn instead of crashing /api/assistant/nudges.

import { registerTrigger } from '../triggers';
import { pool } from '../../website-db';
import { listFirstSeenAt, recordFirstSeen } from '../dismissals';
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
        console.warn(`[assistant.triggers.portal] table ${hintTable} not found — trigger disabled until schema lands`);
      }
      return null;
    }
    throw err;
  }
}

// 1. First-login onboarding — once per (user, profile) ever.
registerTrigger({
  id: 'portal-first-login',
  profile: 'portal',
  async evaluate({ userSub, currentRoute }) {
    if (!currentRoute.startsWith('/portal')) return null;
    const seen = await listFirstSeenAt(userSub, 'portal');
    if (seen) return null;
    await recordFirstSeen(userSub, 'portal');
    const nudge: Nudge = {
      id: 'portal-first-login',
      triggerId: 'portal-first-login',
      profile: 'portal',
      headline: 'Willkommen',
      body: 'Soll ich dir kurz dein Portal zeigen?',
      primaryAction: { label: 'Ja, los', kickoff: 'Zeig mir das Portal Stück für Stück' },
      secondaryAction: { label: 'Später', kickoff: '' },
      createdAt: new Date().toISOString(),
    };
    return nudge;
  },
});

// 2. Signature waiting — DocuSeal document_assignments with status='pending'.
registerTrigger({
  id: 'portal-signature-pending',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await safeQuery<{ id: string; title: string | null }>(
      `SELECT a.id, t.title
         FROM document_assignments a
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN document_templates t ON t.id = a.template_id
         WHERE c.keycloak_user_id = $1 AND a.status = 'pending'
         ORDER BY a.assigned_at DESC LIMIT 1`,
      [userSub],
      'document_assignments',
    );
    const row = r?.rows[0];
    if (!row) return null;
    const title = row.title ?? 'Dokument';
    return {
      id: `portal-signature:${row.id}`,
      triggerId: 'portal-signature-pending',
      profile: 'portal',
      headline: 'Unterschrift offen',
      body: `„${title}" wartet auf dich.`,
      primaryAction: { label: 'Zeig mir das Dokument', kickoff: `Bring mich zur Unterschrift von "${title}"` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 3. 24-hour reminder.
registerTrigger({
  id: 'portal-session-24h',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await safeQuery<{ id: string; scheduled_at: Date }>(
      `SELECT m.id, m.scheduled_at
         FROM meetings m
         JOIN customers c ON c.id = m.customer_id
         WHERE c.keycloak_user_id = $1
           AND m.status = 'scheduled'
           AND m.scheduled_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
         ORDER BY m.scheduled_at ASC LIMIT 1`,
      [userSub],
      'meetings',
    );
    const row = r?.rows[0];
    if (!row) return null;
    const when = row.scheduled_at.toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    return {
      id: `portal-session-24h:${row.id}`,
      triggerId: 'portal-session-24h',
      profile: 'portal',
      headline: 'Morgen Termin',
      body: when,
      primaryAction: { label: 'Vorbereiten?', kickoff: 'Hilf mir, mich auf morgen vorzubereiten' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 4. 1-hour reminder (link live).
registerTrigger({
  id: 'portal-session-1h',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await safeQuery<{ id: string }>(
      `SELECT m.id
         FROM meetings m
         JOIN customers c ON c.id = m.customer_id
         WHERE c.keycloak_user_id = $1
           AND m.status = 'scheduled'
           AND m.scheduled_at BETWEEN now() AND now() + interval '70 minutes'
         ORDER BY m.scheduled_at ASC LIMIT 1`,
      [userSub],
      'meetings',
    );
    const row = r?.rows[0];
    if (!row) return null;
    return {
      id: `portal-session-1h:${row.id}`,
      triggerId: 'portal-session-1h',
      profile: 'portal',
      headline: 'Termin in einer Stunde',
      body: 'Beitreten ist jetzt möglich.',
      primaryAction: { label: 'Beitreten', kickoff: 'Bring mich zum Meetingraum' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 5. New coach message — unread admin-sent messages from the last hour.
//    Recipient is implicit via message_threads.customer_id.
registerTrigger({
  id: 'portal-new-coach-message',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await safeQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM messages m
         JOIN message_threads th ON th.id = m.thread_id
         JOIN customers c ON c.id = th.customer_id
         WHERE c.keycloak_user_id = $1
           AND m.sender_role = 'admin'
           AND m.read_at IS NULL
           AND m.created_at > now() - interval '1 hour'`,
      [userSub],
      'messages',
    );
    const n = Number(r?.rows[0]?.count ?? 0);
    if (!n) return null;
    return {
      id: 'portal-new-coach-message',
      triggerId: 'portal-new-coach-message',
      profile: 'portal',
      headline: `${n} neue Nachricht${n > 1 ? 'en' : ''}`,
      body: 'vom Coach.',
      primaryAction: { label: 'Lesen', kickoff: 'Zeig mir die neuen Nachrichten' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 6. Open Fragebogen request.
registerTrigger({
  id: 'portal-fragebogen-open',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await safeQuery<{ id: string; title: string | null }>(
      `SELECT a.id, t.title
         FROM questionnaire_assignments a
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN questionnaire_templates t ON t.id = a.template_id
         WHERE c.keycloak_user_id = $1 AND a.status = 'pending'
         ORDER BY a.assigned_at DESC LIMIT 1`,
      [userSub],
      'questionnaire_assignments',
    );
    const row = r?.rows[0];
    if (!row) return null;
    const title = row.title ?? 'Fragebogen';
    return {
      id: `portal-fragebogen:${row.id}`,
      triggerId: 'portal-fragebogen-open',
      profile: 'portal',
      headline: 'Fragebogen wartet',
      body: `„${title}"`,
      primaryAction: { label: 'Jetzt starten', kickoff: `Starte den Fragebogen "${title}"` },
      createdAt: new Date().toISOString(),
    };
  },
});
