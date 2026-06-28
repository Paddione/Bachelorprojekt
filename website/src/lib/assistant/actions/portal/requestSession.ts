import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';
import { createInboxItem } from '../../../messaging-db';
import { logger } from '../../../logger';

registerAction({
  id: 'portal:request-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const message = typeof payload.message === 'string' ? payload.message : '';
    return {
      targetLabel: 'Terminanfrage',
      summary: message ? `Terminanfrage: "${message}"` : 'Terminanfrage stellen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return {
        ok: false,
        message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.',
      };
    }

    const message = typeof ctx.payload.message === 'string' ? ctx.payload.message : '';

    try {
      await createInboxItem({
        type: 'booking',
        payload: {
          email: ctx.email,
          keycloakSub: ctx.userSub,
          message,
          source: 'portal-ai-assistant',
        },
      });
    } catch (err) {
      logger.error({ err }, '[requestSession] createInboxItem failed');
      return {
        ok: false,
        message: 'Ihre Terminanfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
      };
    }

    return {
      ok: true,
      message: 'Ihre Terminanfrage ist eingegangen — wir melden uns bei Ihnen, um einen passenden Termin zu vereinbaren.',
    };
  },
});
