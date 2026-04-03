import type { APIRoute } from 'astro';
import { processDueReminders, getPendingReminders } from '../../../lib/reminders';

// Trigger endpoint for processing due meeting reminders.
// Call via cron (e.g. every minute): curl -X POST http://website:4321/api/reminders/process
// Or via K8s CronJob.
export const POST: APIRoute = async () => {
  try {
    const sent = await processDueReminders();
    const pending = getPendingReminders();

    return new Response(
      JSON.stringify({ sent, pending: pending.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Reminder processing error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to process reminders' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// GET to check pending reminders
export const GET: APIRoute = async () => {
  const pending = getPendingReminders();
  return new Response(
    JSON.stringify({ pending: pending.length, reminders: pending.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      meetingStart: r.meetingStart.toISOString(),
      reminderTime: r.reminderTime.toISOString(),
    })) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
