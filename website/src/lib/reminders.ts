// Simple in-memory meeting reminder scheduler.
// Stores upcoming reminders and sends emails when triggered.
// In production, this could be backed by Redis or a K8s CronJob.

import { sendEmail } from './email';

export interface Reminder {
  id: string;
  meetingStart: Date;
  reminderTime: Date; // meetingStart - 10 min
  email: string;
  name: string;
  meetingUrl: string;
  meetingType: string;
  sent: boolean;
}

const reminders = new Map<string, Reminder>();

export function scheduleReminder(params: {
  email: string;
  name: string;
  meetingStart: Date;
  meetingUrl: string;
  meetingType: string;
}): string {
  const id = crypto.randomUUID();
  const reminderTime = new Date(params.meetingStart.getTime() - 10 * 60 * 1000); // 10 min before

  reminders.set(id, {
    id,
    meetingStart: params.meetingStart,
    reminderTime,
    email: params.email,
    name: params.name,
    meetingUrl: params.meetingUrl,
    meetingType: params.meetingType,
    sent: false,
  });

  console.log(`[reminders] Scheduled reminder ${id} for ${params.name} at ${reminderTime.toISOString()}`);
  return id;
}

// Process all due reminders. Call this periodically (e.g. every minute via cron).
export async function processDueReminders(): Promise<number> {
  const now = new Date();
  let sent = 0;

  for (const [id, reminder] of reminders) {
    if (reminder.sent) continue;
    if (reminder.reminderTime > now) continue;

    // Send reminder email
    const startTime = reminder.meetingStart.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });
    const startDate = reminder.meetingStart.toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const emailSent = await sendEmail({
      to: reminder.email,
      subject: `Erinnerung: ${reminder.meetingType} in 10 Minuten`,
      text: `Hallo ${reminder.name},

Ihr Termin beginnt in 10 Minuten!

  Typ:     ${reminder.meetingType}
  Datum:   ${startDate}
  Uhrzeit: ${startTime}

Hier ist Ihr Meeting-Link:
${reminder.meetingUrl}

Klicken Sie auf den Link, um dem Meeting beizutreten.

Mit freundlichen Grussen
${BRAND_NAME}`,
      html: `<p>Hallo ${reminder.name},</p>
<p><strong>Ihr Termin beginnt in 10 Minuten!</strong></p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 12px 4px 0;color:#666">Typ</td><td>${reminder.meetingType}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Datum</td><td>${startDate}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Uhrzeit</td><td>${startTime}</td></tr>
</table>
<p><a href="${reminder.meetingUrl}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p>
<p>Mit freundlichen Grussen<br>${BRAND_NAME}</p>`,
    });

    if (emailSent) {
      reminder.sent = true;
      sent++;
      console.log(`[reminders] Sent reminder ${id} to ${reminder.email}`);
    }
  }

  // Clean up old sent reminders (older than 1 hour past meeting time)
  const cleanupThreshold = now.getTime() - 3600000;
  for (const [id, reminder] of reminders) {
    if (reminder.sent && reminder.meetingStart.getTime() < cleanupThreshold) {
      reminders.delete(id);
    }
  }

  return sent;
}

export function getPendingReminders(): Reminder[] {
  return Array.from(reminders.values()).filter((r) => !r.sent);
}
