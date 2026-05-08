// website/src/lib/assistant/actions/admin/sendInvoice.ts
import { registerAction } from '../../actions';

// TODO: wire end-to-end invoice send (PDF generation + Factur-X embed +
// email delivery). The current send pipeline lives only inside the API route
// `pages/api/admin/billing/[id]/send.ts` and has no extracted helper. Calling
// finalizeInvoice() alone would lock the draft without sending the mail to
// the customer, so we deliberately stub here until a reusable helper exists.

registerAction({
  id: 'admin:send-invoice',
  allowedProfiles: ['admin'],
  describe: (payload) => {
    const invoiceId = String(payload.invoiceId ?? '');
    return {
      targetLabel: invoiceId ? `Rechnung ${invoiceId}` : 'Rechnung',
      summary: 'Finalisiert eine Rechnung (Entwurf → offen) und versendet sie inkl. PDF und E-Invoice-XML per E-Mail an den Kunden.',
    };
  },
  handler: async () => {
    return {
      ok: false,
      message: 'Funktion noch nicht angebunden — wird in einer späteren Iteration implementiert.',
    };
  },
});
