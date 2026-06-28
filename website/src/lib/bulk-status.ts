import { pool } from './website-db';
import { isValidStatus } from './tickets/transition';

export const MAX_BULK_SELECT = 10;

export interface BulkChangeResult {
  changed: { id: string; oldStatus: string }[];
  skipped: { id: string; oldStatus: string; reason: string }[];
  failed: { id: string; error: unknown }[];
  undoToken?: string;
  oldStatuses: Record<string, string>;
}

export interface UndoResult {
  restored: string[];
  failed: { id: string; error: unknown }[];
}

interface UndoStoreItem {
  oldStatuses: Record<string, string>;
  newStatus: string;
  brand: string;
}

const undoStore = new Map<string, UndoStoreItem>();

export async function bulkChangeStatus(
  brand: string,
  ids: string[],
  newStatus: string,
  actor: { id?: string; label: string }
): Promise<BulkChangeResult> {
  if (!isValidStatus(newStatus)) {
    throw new Error(`invalid status: ${newStatus}`);
  }
  if (ids.length > MAX_BULK_SELECT) {
    throw new Error('BATCH_LIMIT_EXCEEDED');
  }

  const changed: { id: string; oldStatus: string }[] = [];
  const skipped: { id: string; oldStatus: string; reason: string }[] = [];
  const failed: { id: string; error: unknown }[] = [];
  const oldStatuses: Record<string, string> = {};

  for (const id of ids) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the ticket row
      const cur = await client.query(
        `SELECT status FROM tickets.tickets WHERE id = $1 AND brand = $2 FOR UPDATE`,
        [id, brand]
      );

      if (cur.rowCount === 0) {
        throw new Error(`ticket ${id} not found`);
      }

      const oldStatus = cur.rows[0].status;

      // 2. Perform the update with guard
      const upd = await client.query(
        `UPDATE tickets.tickets SET status = $1 WHERE id = $2 AND brand = $3 AND status = $4`,
        [newStatus, id, brand, oldStatus]
      );

      if (upd.rowCount === 0) {
        // Concurrent change occurred
        skipped.push({ id, oldStatus, reason: 'concurrent_change' });
        await client.query('COMMIT');
      } else {
        // Insert comment
        const dateStr = new Date().toISOString();
        const commentBody = `Bulk-Status-Wechsel von ${oldStatus} → ${newStatus} durch ${actor.label} am ${dateStr}`;
        
        await client.query(
          `INSERT INTO tickets.ticket_comments (ticket_id, author_id, author_label, kind, body, visibility)
           VALUES ($1, $2, $3, 'status_change', $4, 'internal')`,
          [id, actor.id ?? null, actor.label, commentBody]
        );

        changed.push({ id, oldStatus });
        oldStatuses[id] = oldStatus;
        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      failed.push({ id, error: err });
    } finally {
      client.release();
    }
  }

  let undoToken: string | undefined;
  if (changed.length > 0) {
    const ts = Date.now();
    const tokenPayload = JSON.stringify({ actor, ts, ids: changed.map(c => c.id) });
    undoToken = Buffer.from(tokenPayload).toString('base64url');

    undoStore.set(undoToken, { oldStatuses, newStatus, brand });
    setTimeout(() => {
      undoStore.delete(undoToken!);
    }, 5000);
  }

  return {
    changed,
    skipped,
    failed,
    undoToken,
    oldStatuses,
  };
}

export async function undoBulkStatus(token: string): Promise<UndoResult> {
  const item = undoStore.get(token);
  if (!item) {
    throw new Error('Token not found or expired');
  }

  undoStore.delete(token);

  const { oldStatuses, newStatus, brand } = item;
  const restored: string[] = [];
  const failed: { id: string; error: unknown }[] = [];

  for (const [id, oldStatus] of Object.entries(oldStatuses)) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE tickets.tickets SET status = $1 WHERE id = $2 AND brand = $3 AND status = $4`,
        [oldStatus, id, brand, newStatus]
      );
      if ((upd.rowCount ?? 0) > 0) {
        restored.push(id);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      failed.push({ id, error: err });
    } finally {
      client.release();
    }
  }

  return {
    restored,
    failed,
  };
}
