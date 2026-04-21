// website/src/pages/api/cron/notify-unread.ts
// Called by K8s CronJob every 6h. Sends one email per customer who has unread messages older than 72h.
import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';
import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BRAND_NAME  = process.env.BRAND_NAME || 'Workspace';
const SITE_URL    = process.env.SITE_URL || '';

const pool = new Pool({ connectionString: DB_URL });

interface UnreadRow {
  customer_email: string;
  customer_name: string;
  unread_count: string;
  message_ids: number[];
}

export const POST: APIRoute = async ({ request }) => {
  // Bearer token check
  const auth = request.headers.get('authorization') ?? '';
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // 1. Direct messages: admin-sent messages unread by user, >72h, no notification sent yet
    const { rows: directRows } = await pool.query<UnreadRow>(`
      SELECT c.email AS customer_email, c.name AS customer_name,
             count(m.id)::text AS unread_count,
             array_agg(m.id) AS message_ids
      FROM messages m
      JOIN message_threads t ON t.id = m.thread_id
      JOIN customers c ON c.id = t.customer_id
      WHERE m.sender_role = 'admin'
        AND m.read_at IS NULL
        AND m.notification_sent_at IS NULL
        AND m.created_at < NOW() - INTERVAL '72 hours'
      GROUP BY c.email, c.name
    `);

    // 2. Chat room messages: unread by member, >72h, no notification sent yet
    const { rows: roomRows } = await pool.query<UnreadRow>(`
      SELECT c.email AS customer_email, c.name AS customer_name,
             count(cm.id)::text AS unread_count,
             array_agg(cm.id) AS message_ids
      FROM chat_messages cm
      JOIN chat_room_members crm ON crm.room_id = cm.room_id
      JOIN customers c ON c.id = crm.customer_id
      WHERE cm.notification_sent_at IS NULL
        AND cm.created_at < NOW() - INTERVAL '72 hours'
        AND cm.sender_id != c.keycloak_user_id
        AND NOT EXISTS (
          SELECT 1 FROM chat_message_reads r
          WHERE r.message_id = cm.id AND r.customer_id = c.id
        )
      GROUP BY c.email, c.name
    `);

    // Merge by customer email
    const byEmail = new Map<string, { name: string; directIds: number[]; roomIds: number[] }>();

    for (const row of directRows) {
      byEmail.set(row.customer_email, {
        name: row.customer_name,
        directIds: row.message_ids,
        roomIds: [],
      });
    }
    for (const row of roomRows) {
      const existing = byEmail.get(row.customer_email);
      if (existing) {
        existing.roomIds = row.message_ids;
      } else {
        byEmail.set(row.customer_email, {
          name: row.customer_name,
          directIds: [],
          roomIds: row.message_ids,
        });
      }
    }

    let emailsSent = 0;
    const client = await pool.connect();
    try {
      for (const [email, { name, directIds, roomIds }] of byEmail) {
        const totalUnread = directIds.length + roomIds.length;
        const portalUrl = `${SITE_URL}/portal?section=nachrichten`;

        await sendEmail({
          to: email,
          subject: `Sie haben ${totalUnread} ungelesene Nachricht${totalUnread > 1 ? 'en' : ''} auf ${BRAND_NAME}`,
          text: `Hallo ${name},\n\nSie haben ${totalUnread} ungelesene Nachricht${totalUnread > 1 ? 'en' : ''} in Ihrem Portal.\n\nJetzt lesen: ${portalUrl}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
          html: `<p>Hallo ${name},</p><p>Sie haben <strong>${totalUnread} ungelesene Nachricht${totalUnread > 1 ? 'en' : ''}</strong> in Ihrem Portal.</p><p><a href="${portalUrl}" style="display:inline-block;background:#7c6ff7;color:#fff;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Portal öffnen</a></p><p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
        });
        emailsSent++;

        // Mark notification_sent_at on processed message rows
        if (directIds.length > 0) {
          await client.query(
            `UPDATE messages SET notification_sent_at = NOW() WHERE id = ANY($1)`,
            [directIds],
          );
        }
        if (roomIds.length > 0) {
          await client.query(
            `UPDATE chat_messages SET notification_sent_at = NOW() WHERE id = ANY($1)`,
            [roomIds],
          );
        }
      }
    } finally {
      client.release();
    }

    console.log(`[notify-unread] Sent ${emailsSent} notification emails`);
    return new Response(JSON.stringify({ emailsSent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-unread]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
