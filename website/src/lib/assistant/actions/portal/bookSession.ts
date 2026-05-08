import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

const STUB_MESSAGE =
  'Funktion noch nicht angebunden — wird in einer späteren Iteration implementiert.';

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
  // No portal-side createBooking helper exists — bookings flow through the
  // contact form (createInboxItem) which requires manual fields and a captcha.
  // Stub until a userSub-scoped booking helper is introduced.
  handler: async (): Promise<ActionResult> => ({ ok: false, message: STUB_MESSAGE }),
});
