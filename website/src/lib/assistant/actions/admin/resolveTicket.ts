// website/src/lib/assistant/actions/admin/resolveTicket.ts
import { registerAction } from '../../actions';
import { transitionTicket, type TicketResolution } from '../../../tickets/transition';

const VALID_RESOLUTIONS: ReadonlySet<TicketResolution> = new Set([
  'fixed', 'shipped', 'wontfix', 'duplicate', 'cant_reproduce', 'obsolete',
]);

registerAction({
  id: 'admin:resolve-ticket',
  allowedProfiles: ['admin'],
  describe: (payload) => {
    const ticketId = String(payload.ticketId ?? '');
    const resolution = String(payload.resolution ?? 'fixed');
    return {
      targetLabel: ticketId ? `Ticket ${ticketId}` : 'Ticket',
      summary: `Schließt das Ticket mit Status \"done\" und Resolution \"${resolution}\". Bei Bug-Tickets mit Reporter-E-Mail wird automatisch eine Abschluss-Mail verschickt.`,
    };
  },
  handler: async ({ payload, userSub }) => {
    const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : '';
    const resolution = typeof payload.resolution === 'string' ? payload.resolution : '';
    const note = typeof payload.note === 'string' ? payload.note : undefined;

    if (!ticketId) return { ok: false, message: 'Keine ticketId angegeben.' };
    if (!resolution || !VALID_RESOLUTIONS.has(resolution as TicketResolution)) {
      return {
        ok: false,
        message: `Ungültige Resolution: \"${resolution}\". Erlaubt: ${[...VALID_RESOLUTIONS].join(', ')}.`,
      };
    }

    try {
      const result = await transitionTicket(ticketId, {
        status: 'done',
        resolution: resolution as TicketResolution,
        note,
        noteVisibility: 'internal',
        actor: { id: userSub, label: userSub || 'assistant' },
      });
      return {
        ok: true,
        message: `Ticket ${result.externalId ?? result.id} wurde geschlossen (resolution=${result.resolution}${result.emailSent ? ', E-Mail versendet' : ''}).`,
        data: { ...result },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
      return { ok: false, message: `Ticket-Schließung fehlgeschlagen: ${msg}` };
    }
  },
});
