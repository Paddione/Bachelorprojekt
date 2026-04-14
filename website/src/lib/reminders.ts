// Meeting reminder scheduler backed by PostgreSQL.
// Stores reminders in the database so they survive container restarts.
// Triggered every minute by K8s CronJob -> POST /api/reminders/process.

import pg from 'pg';
import { sendEmail } from './email';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const REMINDERS_DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://meetings:devmeetingsdb@shared-db.workspace.svc.cluster.local:5432/meetings';

const pool = new pg.Pool({ connectionString: REMINDERS_DB_URL });

let tableReady = false;
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      meeting_start TIMESTAMPTZ NOT NULL,
      reminder_time TIMESTAMPTZ NOT NULL,
      meeting_url TEXT NOT NULL,
      meeting_type TEXT NOT NULL,
      sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  tableReady = true;
}

export interface Reminder {
  id: string;
  meetingStart: Date;
  reminderTime: Date;
  email: string;
  name: string;
  meetingUrl: string;
  meetingType: string;
  sent: boolean;
}

export async function scheduleReminder(params: {
  email: string;
  name: string;
  meetingStart: Date;
  meetingUrl: string;
  meetingType: string;
}): Promise<string> {
  await ensureTable();
  const reminderTime = new Date(params.meetingStart.getTime() - 10 * 60 * 1000);

  const result = await pool.query(
    `INSERT INTO meeting_reminders (email, name, meeting_start, reminder_time, meeting_url, meeting_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [params.email, params.name, params.meetingStart, reminderTime, params.meetingUrl, params.meetingType]
  );

  const id = result.rows[0].id;
  console.log(`[reminders] Scheduled reminder ${id} for ${params.name} at ${reminderTime.toISOString()}`);
  return id;
}

export async function processDueReminders(): Promise<number> {
  await ensureTable();
  let sent = 0;

  const result = await pool.query(
    `SELECT id, email, name, meeting_start, reminder_time, meeting_url, meeting_type
     FROM meeting_reminders
     WHERE sent = false AND reminder_time <= NOW()
     ORDER BY reminder_time ASC`
  );

  for (const row of result.rows) {
    const startTime = new Date(row.meeting_start).toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });
    const startDate = new Date(row.meeting_start).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const emailSent = await sendEmail({
      to: row.email,
      subject: `Erinnerung: ${row.meeting_type} in 10 Minuten`,
      text: `Hallo ${row.name},

Ihr Termin beginnt in 10 Minuten!

  Typ:     ${row.meeting_type}
  Datum:   ${startDate}
  Uhrzeit: ${startTime}

Hier ist Ihr Meeting-Link:
${row.meeting_url}

Klicken Sie auf den Link, um dem Meeting beizutreten.

Mit freundlichen Grüßen
${BRAND_NAME}`,
      html: `<p>Hallo ${row.name},</p>
<p><strong>Ihr Termin beginnt in 10 Minuten!</strong></p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 12px 4px 0;color:#666">Typ</td><td>${row.meeting_type}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Datum</td><td>${startDate}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Uhrzeit</td><td>${startTime}</td></tr>
</table>
<p><a href="${row.meeting_url}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p>
<p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
    });

    if (emailSent) {
      await pool.query('UPDATE meeting_reminders SET sent = true WHERE id = $1', [row.id]);
      sent++;
      console.log(`[reminders] Sent reminder ${row.id} to ${row.email}`);
    }
  }

  // Clean up old sent reminders (older than 1 hour past meeting time)
  await pool.query(
    `DELETE FROM meeting_reminders WHERE sent = true AND meeting_start < NOW() - INTERVAL '1 hour'`
  );

  return sent;
}

export async function getPendingReminders(): Promise<Reminder[]> {
  await ensureTable();
  const result = await pool.query(
    `SELECT id, email, name, meeting_start, reminder_time, meeting_url, meeting_type, sent
     FROM meeting_reminders WHERE sent = false ORDER BY reminder_time ASC`
  );

  return result.rows.map(row => ({
    id: row.id,
    meetingStart: new Date(row.meeting_start),
    reminderTime: new Date(row.reminder_time),
    email: row.email,
    name: row.name,
    meetingUrl: row.meeting_url,
    meetingType: row.meeting_type,
    sent: row.sent,
  }));
}
