import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

const STUB_MESSAGE =
  'Funktion noch nicht angebunden — wird in einer späteren Iteration implementiert.';

registerAction({
  id: 'portal:cancel-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const bookingId =
      typeof payload.bookingId === 'string' ? payload.bookingId : '';
    const reason = typeof payload.reason === 'string' ? payload.reason : '';
    return {
      targetLabel: bookingId ? `Termin ${bookingId}` : 'Termin absagen',
      summary: reason
        ? `Termin absagen (Grund: ${reason}).`
        : 'Termin absagen.',
    };
  },
  // No portal-scoped cancelBooking helper exists. The only delete path lives
  // under /api/admin/bookings/[uid]/delete and is admin-gated. A real handler
  // would need to verify the booking's attendee email against the session
  // before calling a future cancel helper. Stub for now.
  handler: async (): Promise<ActionResult> => ({ ok: false, message: STUB_MESSAGE }),
});
