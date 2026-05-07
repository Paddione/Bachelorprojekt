// website/src/lib/tickets/transition.ts
import { pool } from '../website-db';
import { sendBugCloseEmail } from './email-templates';
import { linkReporterByEmail } from './reporter-link';

export type TicketStatus =
  'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';

export type TicketResolution =
  'fixed' | 'shipped' | 'wontfix' | 'duplicate' | 'cant_reproduce' | 'obsolete';

const VALID_STATUSES: ReadonlySet<TicketStatus> = new Set(
  ['triage', 'backlog', 'in_progress', 'in_review', 'blocked', 'done', 'archived']);

const VALID_RESOLUTIONS: ReadonlySet<TicketResolution> = new Set(
  ['fixed', 'shipped', 'wontfix', 'duplicate', 'cant_reproduce', 'obsolete']);

export interface TransitionParams {
  status: TicketStatus;
  resolution?: TicketResolution;
  note?: string;
  noteVisibility?: 'internal' | 'public';
  actor: { id?: string; label: string };
  prNumber?: number;
}

export interface TransitionResult {
  id: string;
  externalId: string | null;
  type: string;
  status: TicketStatus;
  resolution: TicketResolution | null;
  emailSent: boolean;
}

export async function transitionTicket(
  ticketId: string,
  p: TransitionParams
): Promise<TransitionResult> {
  if (!VALID_STATUSES.has(p.status)) {
    throw new Error(`invalid status: ${p.status}`);
  }
  if ((p.status === 'done' || p.status === 'archived') && !p.resolution) {
    throw new Error(`status=${p.status} requires a resolution`);
  }
  if (p.resolution && !VALID_RESOLUTIONS.has(p.resolution)) {
    throw new Error(`invalid resolution: ${p.resolution}`);
  }
  if (p.resolution && p.status !== 'done' && p.status !== 'archived') {
    throw new Error(`resolution must not be set for non-terminal status: ${p.status}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (p.actor.id) {
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [p.actor.id]);
    }
    await client.query(`SELECT set_config('app.user_label', $1, true)`, [p.actor.label]);

    const cur = await client.query(
      `SELECT id, external_id, type, status, reporter_email, brand
         FROM tickets.tickets WHERE id = $1 FOR UPDATE`,
      [ticketId]
    );
    if (cur.rowCount === 0) throw new Error(`ticket ${ticketId} not found`);
    const before = cur.rows[0];

    const upd = await client.query(
      `UPDATE tickets.tickets
         SET status = $1,
             resolution = CASE WHEN $1 IN ('done','archived') THEN $2 ELSE NULL END
       WHERE id = $3
       RETURNING id, external_id, type, status, resolution, reporter_email, brand`,
      [p.status, p.resolution ?? null, ticketId]
    );
    const after = upd.rows[0];

    if (p.note) {
      await client.query(
        `INSERT INTO tickets.ticket_comments
           (ticket_id, author_id, author_label, kind, body, visibility)
         VALUES ($1, $2, $3, 'status_change', $4, $5)`,
        [ticketId, p.actor.id ?? null, p.actor.label, p.note, p.noteVisibility ?? 'internal']
      );
    }

    if (p.prNumber) {
      await client.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number, created_by)
         VALUES ($1, $1, 'fixes', $2, $3)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [ticketId, p.prNumber, p.actor.id ?? null]
      );
    }

    await client.query('COMMIT');

    let emailSent = false;
    const becomingDone = before.status !== 'done' && p.status === 'done';
    if (becomingDone && after.type === 'bug' && after.reporter_email) {
      await linkReporterByEmail(after.reporter_email);
      emailSent = await sendBugCloseEmail({
        externalId: after.external_id ?? after.id,
        reporterEmail: after.reporter_email,
        resolution: after.resolution,
        note: p.noteVisibility === 'public' ? p.note : undefined,
      });
    }

    return {
      id: after.id,
      externalId: after.external_id,
      type: after.type,
      status: after.status,
      resolution: after.resolution,
      emailSent,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
