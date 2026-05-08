import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

const STUB_MESSAGE =
  'Funktion noch nicht angebunden — wird in einer späteren Iteration implementiert.';

registerAction({
  id: 'portal:move-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const bookingId =
      typeof payload.bookingId === 'string' ? payload.bookingId : '';
    const newDatetime =
      typeof payload.newDatetime === 'string' ? payload.newDatetime : '';
    return {
      targetLabel: bookingId ? `Termin ${bookingId}` : 'Termin verschieben',
      summary: newDatetime
        ? `Termin auf ${newDatetime} verschieben.`
        : 'Termin verschieben.',
    };
  },
  // No moveBooking/updateBooking helper exists in caldav.ts (only read-only
  // getClientBookings + admin-only delete via /api/admin/bookings/[uid]/delete).
  // A real handler would need to (1) verify the booking's attendeeEmail equals
  // the session email tied to userSub, then (2) call a yet-to-exist
  // updateBooking helper. Stub for now.
  handler: async (): Promise<ActionResult> => ({ ok: false, message: STUB_MESSAGE }),
});
