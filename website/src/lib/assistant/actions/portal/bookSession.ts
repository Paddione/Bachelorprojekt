import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { createCalendarEvent } from '../../../../caldav.js';
import { sendBookingConfirmation } from '../../../../email.js';

registerAction({
  id: 'portal:book-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const datetime = typeof payload.datetime === 'string' ? payload.datetime : '';
    const serviceId = typeof payload.serviceId === 'string' ? payload.serviceId : '';
    return {
      targetLabel: serviceId ? `Termin (${serviceId})` : 'Termin buchen',
      summary: datetime
        ? `Neuen Termin für ${datetime} buchen.`
        : 'Neuen Termin buchen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return { ok: false, message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.' };
    }

    const datetimeStr = typeof ctx.payload.datetime === 'string' ? ctx.payload.datetime : null;
    if (!datetimeStr) {
      return { ok: false, message: 'Bitte geben Sie einen Wunschtermin an (z.B. "Montag 15.7. um 10 Uhr").' };
    }

    const start = new Date(datetimeStr);
    if (isNaN(start.getTime())) {
      return { ok: false, message: `Ungültiges Datum: ${datetimeStr}` };
    }

    const durationMin = typeof ctx.payload.durationMin === 'number' ? ctx.payload.durationMin : 60;
    const end = new Date(start.getTime() + durationMin * 60_000);

    const serviceId = typeof ctx.payload.serviceId === 'string' ? ctx.payload.serviceId : '';
    const summary = serviceId ? `Termin: ${serviceId}` : 'Beratungstermin';

    const result = await createCalendarEvent({
      summary,
      description: `Gebucht von ${ctx.email}`,
      start,
      end,
      attendeeEmail: ctx.email,
    });

    if (!result) {
      return { ok: false, message: 'Der Termin konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.' };
    }

    // Send confirmation email — non-blocking (fire-and-forget on error)
    sendBookingConfirmation({ to: ctx.email, name: ctx.email, start, end }).catch(() => {});

    const startStr = start.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      ok: true,
      message: `Ihr Termin am ${startStr} wurde bestätigt. Sie erhalten eine Bestätigungs-E-Mail.`,
      data: { uid: result.uid },
    };
  },
});
