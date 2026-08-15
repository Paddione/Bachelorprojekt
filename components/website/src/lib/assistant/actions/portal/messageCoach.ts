import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

const STUB_MESSAGE =
  'Funktion noch nicht angebunden — wird in einer späteren Iteration implementiert.';

registerAction({
  id: 'portal:message-coach',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const body = typeof payload.body === 'string' ? payload.body : '';
    const preview = body.length > 60 ? `${body.slice(0, 57)}…` : body;
    return {
      targetLabel: 'Nachricht an Coach',
      summary: preview ? `„${preview}"` : 'Nachricht an deinen Coach senden.',
    };
  },
  // Sending requires resolving userSub → email → customer.id → thread (via
  // getCustomerByEmail + getOrCreateThreadForCustomer in messaging-db.ts).
  // The ActionContext currently only carries userSub, not email — wiring this
  // without the email-mapping step risks posting under the wrong customer.
  // Stub until a userSub-aware messaging helper exists.
  handler: async (): Promise<ActionResult> => ({ ok: false, message: STUB_MESSAGE }),
});
