// website/src/pages/api/admin/meetings/create.ts
//
// Manually create a meeting from the admin /admin/meetings UI.
// Persists into both the `meetings` table (so it shows on /admin/meetings,
// in /admin/live's recent sessions and in the calendar) and into Nextcloud
// CalDAV (so it shows in /admin/kalender alongside tasks/projects/bookings).
// Closes T000161, T000164.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { upsertCustomer, createMeeting } from '../../../../lib/website-db';
import { createCalendarEvent } from '../../../../lib/caldav';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

interface CreateMeetingBody {
  customerName?: string;
  customerEmail?: string;
  meetingType?: string;
  scheduledAt?: string;     // ISO 8601
  durationMinutes?: number; // optional, default 60
  projectId?: string | null;
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return jsonError(401, 'Unauthorized');
  if (!isAdmin(session)) return jsonError(403, 'Forbidden');

  let body: CreateMeetingBody;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Ungültiger Request-Body.');
  }

  const customerName = body.customerName?.trim();
  const customerEmail = body.customerEmail?.trim();
  const meetingType = body.meetingType?.trim() || 'Meeting';
  const scheduledAtRaw = body.scheduledAt?.trim();
  const durationMinutes = body.durationMinutes && body.durationMinutes > 0
    ? Math.min(body.durationMinutes, 8 * 60)
    : 60;

  if (!customerName) return jsonError(400, 'Teilnehmer-Name ist Pflicht.');
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return jsonError(400, 'Gültige Teilnehmer-E-Mail ist Pflicht.');
  }
  if (!scheduledAtRaw) return jsonError(400, 'Datum + Uhrzeit sind Pflicht.');

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return jsonError(400, 'Ungültiges Datum/Uhrzeit-Format.');
  }
  const endsAt = new Date(scheduledAt.getTime() + durationMinutes * 60_000);

  try {
    const customer = await upsertCustomer({ name: customerName, email: customerEmail });

    const meeting = await createMeeting({
      customerId: customer.id,
      meetingType,
      scheduledAt,
      projectId: body.projectId ?? undefined,
    });

    // Best-effort calendar persist — meetings list + admin calendar still
    // visualise the meeting via the meetings table even if CalDAV is down.
    let calendarPersisted = true;
    try {
      const result = await createCalendarEvent({
        summary: `${meetingType}: ${customerName}`,
        description: `Meeting mit ${customerName} (${customerEmail})\nTyp: ${meetingType}`,
        start: scheduledAt,
        end: endsAt,
        attendeeEmail: customerEmail,
        attendeeName: customerName,
      });
      if (!result) calendarPersisted = false;
    } catch (err) {
      console.error('[admin/meetings/create] CalDAV persist failed:', err);
      calendarPersisted = false;
    }

    return new Response(JSON.stringify({
      success: true,
      meeting: {
        id: meeting.id,
        customerId: meeting.customerId,
        meetingType,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes,
      },
      calendarPersisted,
      brand: BRAND_NAME,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[api/admin/meetings/create]', err);
    return jsonError(500, 'Interner Serverfehler beim Anlegen des Meetings.');
  }
};
