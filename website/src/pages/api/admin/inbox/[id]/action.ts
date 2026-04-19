// website/src/pages/api/admin/inbox/[id]/action.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getInboxItem, updateInboxItemStatus } from '../../../../../lib/messaging-db';
import { createUser, sendPasswordResetEmail } from '../../../../../lib/keycloak';
import { createCalendarEvent } from '../../../../../lib/caldav';
import { createTalkRoom, inviteGuestByEmail } from '../../../../../lib/talk';
import { scheduleReminder } from '../../../../../lib/reminders';
import { sendRegistrationApproved, sendRegistrationDeclined, sendEmail } from '../../../../../lib/email';
import { upsertCustomer, resolveBugTicket } from '../../../../../lib/website-db';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const SITE_URL   = process.env.SITE_URL || '';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  }

  const item = await getInboxItem(id);
  if (!item) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }
  if (item.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Already actioned' }), { status: 409 });
  }

  const body = await request.json() as { action: string; note?: string };
  const { action, note } = body;

  try {
    switch (action) {

      case 'approve_registration': {
        const p = item.payload as { email: string; firstName: string; lastName: string; phone?: string; company?: string };
        const fullName = `${p.firstName} ${p.lastName}`;

        const result = await createUser({ email: p.email, firstName: p.firstName, lastName: p.lastName, phone: p.phone, company: p.company });

        let userId = result.userId;

        // If user already exists (e.g. partial failure on prior attempt), look up the existing user
        // so we can still send the password reset and complete the approval.
        if (!result.success && result.error?.includes('bereits')) {
          const { listUsers } = await import('../../../../../lib/keycloak');
          const allUsers = await listUsers();
          const existing = allUsers.find(u => u.email?.toLowerCase() === p.email.toLowerCase());
          if (existing) {
            userId = existing.id;
          } else {
            return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), { status: 500 });
          }
        } else if (!result.success || !userId) {
          return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), { status: 500 });
        }

        await sendPasswordResetEmail(userId);
        // Emails are best-effort — upsertCustomer and inbox update must still succeed
        sendRegistrationApproved(p.email, fullName).catch(err =>
          console.error('[approve_registration] Failed to send approval email:', err)
        );
        await upsertCustomer({ name: fullName, email: p.email, phone: p.phone, company: p.company, keycloakUserId: userId });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true, message: `${fullName} freigeschaltet` }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'decline_registration': {
        const p = item.payload as { email: string; firstName: string; lastName: string };
        await sendRegistrationDeclined(p.email, `${p.firstName} ${p.lastName}`);
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'approve_booking': {
        const p = item.payload as {
          name: string; email: string; phone?: string; typeLabel: string;
          slotStart: string; slotEnd: string; slotDisplay: string; date: string;
        };
        const meetingStart = new Date(p.slotStart);
        const meetingEnd   = new Date(p.slotEnd);
        const dateFormatted = new Date(p.date + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        });
        const statusParts: string[] = [];

        const room = await createTalkRoom({
          name: `${p.typeLabel}: ${p.name}`,
          description: `${p.typeLabel} mit ${p.name} (${p.email}) am ${dateFormatted}, ${p.slotDisplay}`,
        });
        if (room) {
          await inviteGuestByEmail(room.token, p.email);
          statusParts.push(`Talk-Raum erstellt: ${room.url}`);
        } else {
          statusParts.push('Talk-Raum konnte nicht erstellt werden');
        }

        const calEvent = await createCalendarEvent({
          summary: `${p.typeLabel}: ${p.name}`,
          description: `Termin mit ${p.name} (${p.email})\nTyp: ${p.typeLabel}${room ? `\nMeeting: ${room.url}` : ''}`,
          start: meetingStart, end: meetingEnd,
          attendeeEmail: p.email, attendeeName: p.name,
        });
        statusParts.push(calEvent ? 'Kalendereintrag erstellt' : 'Kalendereintrag fehlgeschlagen');

        if (room) {
          await scheduleReminder({ email: p.email, name: p.name, meetingStart, meetingUrl: room.url, meetingType: p.typeLabel });
          statusParts.push('Erinnerung geplant (10 Min. vorher)');
        }

        const meetingLinkHtml = room
          ? `<p><a href="${room.url}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p>`
          : '';
        await sendEmail({
          to: p.email,
          subject: `Termin bestätigt: ${p.typeLabel} am ${dateFormatted}`,
          text: `Hallo ${p.name},\n\nIhr Termin wurde bestätigt!\n\n  Typ:     ${p.typeLabel}\n  Datum:   ${dateFormatted}\n  Uhrzeit: ${p.slotDisplay}${room ? `\n\nIhr Meeting-Link:\n${room.url}\n\nSie erhalten 10 Minuten vor dem Termin eine Erinnerung.` : ''}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
          html: `<p>Hallo ${p.name},</p><p><strong>Ihr Termin wurde bestätigt!</strong></p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Typ</td><td>${p.typeLabel}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Datum</td><td>${dateFormatted}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Uhrzeit</td><td>${p.slotDisplay}</td></tr></table>${meetingLinkHtml}<p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
        });
        statusParts.push('Bestätigungs-E-Mail versendet');
        await upsertCustomer({ name: p.name, email: p.email, phone: p.phone });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true, details: statusParts }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'decline_booking': {
        const p = item.payload as { name: string; email: string; typeLabel: string; slotDisplay: string; date: string };
        const dateFormatted = new Date(p.date + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        });
        await sendEmail({
          to: p.email,
          subject: `Zu Ihrer Terminanfrage bei ${BRAND_NAME}`,
          text: `Hallo ${p.name},\n\nleider können wir den angefragten Termin (${p.typeLabel} am ${dateFormatted}, ${p.slotDisplay}) nicht bestätigen.\n\nBitte wählen Sie einen alternativen Termin unter https://web.${PROD_DOMAIN}/termin oder kontaktieren Sie uns direkt.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
        });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'archive_contact': {
        await updateInboxItemStatus(id, 'archived', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'resolve_bug': {
        const resolveNote = note?.trim() ?? '';
        if (!resolveNote) {
          return new Response(JSON.stringify({ error: 'Bitte geben Sie eine Notiz an.' }), { status: 400 });
        }
        if (resolveNote.length > 500) {
          return new Response(JSON.stringify({ error: 'Max. 500 Zeichen.' }), { status: 400 });
        }
        const p = item.payload as { ticketId: string; reporterEmail: string; brand: string };
        await resolveBugTicket(p.ticketId, resolveNote);
        const BRAND_INBOX: Record<string, string> = {
          mentolder: 'info@mentolder.de',
          korczewski: 'info@korczewski.de',
        };
        await sendEmail({
          to: BRAND_INBOX[p.brand] ?? 'info@mentolder.de',
          subject: `[${p.ticketId}] Erledigt`,
          text: `Ticket ${p.ticketId} wurde als erledigt markiert.\n\nNotiz:\n${resolveNote}`,
          replyTo: p.reporterEmail,
        });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'close_user_message': {
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'finalize_meeting': {
        const p = item.payload as {
          customerName: string; customerEmail: string; meetingType: string;
          meetingDate: string; roomToken?: string; projectId?: string;
        };
        const res = await fetch(`${SITE_URL}/api/meeting/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: p.customerName, customerEmail: p.customerEmail,
            meetingType: p.meetingType, meetingDate: p.meetingDate,
            roomToken: p.roomToken ?? undefined,
            projectId: p.projectId ?? undefined,
          }),
        });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: 'Meeting-Finalisierung fehlgeschlagen.' }), { status: 500 });
        }
        const data = await res.json() as { results?: string[] };
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true, results: data.results ?? [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), { status: 400 });
    }
  } catch (err) {
    console.error(`[inbox action ${action}] id=${id}`, err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500 });
  }
};
