import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { getClientBookings, deleteCalendarEvent } from '../../../../caldav.js';
import { sendCancellationNotification } from '../../../../email.js';

registerAction({
  id: 'portal:cancel-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const uid = typeof payload.uid === 'string' ? payload.uid : '';
    const reason = typeof payload.reason === 'string' ? payload.reason : '';
    return {
      targetLabel: uid ? `Termin ${uid}` : 'Termin absagen',
      summary: reason ? `Termin absagen (Grund: ${reason}).` : 'Termin absagen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return { ok: false, message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.' };
    }

    const uid = typeof ctx.payload.uid === 'string' ? ctx.payload.uid : null;
    if (!uid) {
      return { ok: false, message: 'Bitte geben Sie die UID des Termins an, den Sie absagen möchten.' };
    }

    // Ownership guard: only allow cancelling own bookings
    let bookingStart: Date | undefined;
    try {
      const bookings = await getClientBookings(ctx.email);
      const own = bookings.find((b) => b.uid === uid);
      if (!own) {
        return {
          ok: false,
          message: 'Dieser Termin wurde nicht gefunden oder Sie haben keine Berechtigung, ihn abzusagen.',
        };
      }
      bookingStart = own.start;
    } catch {
      return { ok: false, message: 'Ihre Termine konnten nicht abgerufen werden. Bitte versuchen Sie es erneut.' };
    }

    const deleted = await deleteCalendarEvent(uid);
    if (!deleted) {
      return { ok: false, message: 'Der Termin konnte nicht abgesagt werden. Bitte versuchen Sie es erneut.' };
    }

    if (bookingStart) {
      sendCancellationNotification({
        to: ctx.email,
        name: ctx.email,
        start: bookingStart,
      }).catch(() => {});
    }

    return {
      ok: true,
      message: 'Ihr Termin wurde erfolgreich abgesagt. Sie erhalten eine Bestätigungs-E-Mail.',
    };
  },
});
