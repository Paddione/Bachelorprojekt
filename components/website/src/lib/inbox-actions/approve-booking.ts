// components/website/src/lib/inbox-actions/approve-booking.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { createCalendarEvent } from '../caldav';
import { createTalkRoom, inviteGuestByEmail, sendChatMessage } from '../talk';
import { sendEmail } from '../email';
import { upsertCustomer, createMeeting, claimBrettLinkPost, setBookingInvoice } from '../website-db';
import { getOrCreateCustomer, createBillingInvoice, SERVICES } from '../stripe-billing';
import type { ServiceKey } from '../stripe-billing';
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';

export const approveBooking: InboxActionHandler = async (ctx, item, id) => {
  const { session, request, requestLogger } = ctx;
  const p = item.payload as {
    name: string; email: string; phone?: string; typeLabel: string;
    slotStart: string; slotEnd: string; slotDisplay: string; date: string;
    serviceKey?: string; leistungKey?: string; projectId?: string;
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

  const meetingLinkHtml = room
    ? `<p><a href="${room.url}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p>`
    : '';
  await sendEmail({
    to: p.email,
    subject: `Termin bestätigt: ${p.typeLabel} am ${dateFormatted}`,
    text: `Hallo ${p.name},\n\nIhr Termin wurde bestätigt!\n\n  Typ:     ${p.typeLabel}\n  Datum:   ${dateFormatted}\n  Uhrzeit: ${p.slotDisplay}${room ? `\n\nIhr Meeting-Link:\n${room.url}` : ''}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
    html: `<p>Hallo ${p.name},</p><p><strong>Ihr Termin wurde bestätigt!</strong></p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Typ</td><td>${p.typeLabel}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Datum</td><td>${dateFormatted}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Uhrzeit</td><td>${p.slotDisplay}</td></tr></table>${meetingLinkHtml}<p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
  }, request);
  statusParts.push('Bestätigungs-E-Mail versendet');
  const customer = await upsertCustomer({ name: p.name, email: p.email, phone: p.phone });

  const meeting = await createMeeting({
    customerId: customer.id,
    meetingType: p.typeLabel,
    scheduledAt: meetingStart,
    talkRoomToken: room?.token ?? undefined,
    projectId: p.projectId ?? undefined,
  }).catch(err => { requestLogger.error({ err }, '[approve_booking] Failed to create meeting record:'); return null; });

  // Auto-post the systemisches Brett link into the new Talk room (idempotent).
  try {
    if (meeting && room && await claimBrettLinkPost(meeting.id)) {
      const brettDomain = process.env.BRETT_DOMAIN || 'brett.localhost';
      const url = `https://${brettDomain}/?room=${encodeURIComponent(room.token)}`;
      await sendChatMessage(room.token, `🎯 Systemisches Brett für diese Session: ${url}`);
    }
  } catch (err) {
    requestLogger.error({ err }, '[brett] auto-post failed (non-fatal):');
  }

  const svcKey = (p.serviceKey ?? p.leistungKey) as ServiceKey | undefined;
  if (svcKey && svcKey in SERVICES && SERVICES[svcKey].cents > 0) {
    const brand = process.env.BRAND || 'mentolder';
    try {
      const billingCustomer = await getOrCreateCustomer({ brand, name: p.name, email: p.email });
      if (billingCustomer) {
        const invoice = await createBillingInvoice({ customerId: billingCustomer.id, serviceKey: svcKey });
        statusParts.push(`Rechnung erstellt: ${invoice.number}`);
        if (calEvent) {
          await setBookingInvoice(calEvent.uid, brand, invoice.id, invoice.number, invoice.amountDue).catch(err =>
            requestLogger.error({ err }, '[approve_booking] Failed to link invoice to booking:')
          );
        }
      }
    } catch (err) {
      // Invoice creation must not abort the booking confirmation — the
      // Talk room, calendar event, and confirmation email are already
      // committed at this point. Log it and surface a status hint so the
      // caller still gets HTTP 200 with details.
      requestLogger.error({ err }, '[approve_booking] Failed to create billing invoice:');
      statusParts.push('Rechnung konnte nicht erstellt werden (siehe Logs)');
    }
  }

  await updateInboxItemStatus(id, 'actioned', session.preferred_username);
  return new Response(JSON.stringify({ success: true, details: statusParts }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
