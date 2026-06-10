import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { getClientBookings, updateCalendarEventTime } from '../../../../caldav.js';
import { sendRescheduleNotification } from '../../../../email.js';

registerAction({
  id: 'portal:move-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const uid = typeof payload.uid === 'string' ? payload.uid : '';
    const newDatetime = typeof payload.newDatetime === 'string' ? payload.newDatetime : '';
    return {
      targetLabel: uid ? `Termin ${uid}` : 'Termin verschieben',
      summary: newDatetime ? `Termin auf ${newDatetime} verschieben.` : 'Termin verschieben.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return { ok: false, message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.' };
    }

    const uid = typeof ctx.payload.uid === 'string' ? ctx.payload.uid : null;
    const newDatetimeStr = typeof ctx.payload.newDatetime === 'string' ? ctx.payload.newDatetime : null;

    if (!uid || !newDatetimeStr) {
      return {
        ok: false,
        message: 'Bitte geben Sie die UID des Termins und den neuen Wunschtermin an.',
      };
    }

    const newStart = new Date(newDatetimeStr);
    if (isNaN(newStart.getTime())) {
      return { ok: false, message: `Ungültiges Datum: ${newDatetimeStr}` };
    }

    const durationMin = typeof ctx.payload.durationMin === 'number' ? ctx.payload.durationMin : 60;
    const newEnd = new Date(newStart.getTime() + durationMin * 60_000);

    // Ownership guard
    try {
      const bookings = await getClientBookings(ctx.email);
      const own = bookings.find((b) => b.uid === uid);
      if (!own) {
        return {
          ok: false,
          message: 'Dieser Termin wurde nicht gefunden oder Sie haben keine Berechtigung, ihn zu verschieben.',
        };
      }
    } catch {
      return { ok: false, message: 'Ihre Termine konnten nicht abgerufen werden. Bitte versuchen Sie es erneut.' };
    }

    const updated = await updateCalendarEventTime(uid, newStart, newEnd);
    if (!updated) {
      return { ok: false, message: 'Der Termin konnte nicht verschoben werden. Bitte versuchen Sie es erneut.' };
    }

    sendRescheduleNotification({
      to: ctx.email,
      name: ctx.email,
      newStart,
      newEnd,
    }).catch(() => {});

    const newStartStr = newStart.toLocaleString('de-DE', {
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
      message: `Ihr Termin wurde auf ${newStartStr} verschoben. Sie erhalten eine Bestätigungs-E-Mail.`,
    };
  },
});
