import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

registerAction({
  id: 'portal:sign-document',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const documentId =
      typeof payload.documentId === 'string' ? payload.documentId : '';
    return {
      targetLabel: documentId ? `Dokument ${documentId}` : 'Dokument unterschreiben',
      summary: 'Zur DocuSeal-Signaturseite weiterleiten.',
    };
  },
  // Redirect-only: /portal/sign/[assignmentId] re-validates ownership server-side
  // (session.email → getCustomerByEmail → listAssignmentsForCustomer must contain
  // the assignmentId; otherwise it 302s back to /portal). So returning the URL
  // here cannot leak another user's document — the route is the security boundary.
  handler: async ({ payload }): Promise<ActionResult> => {
    const documentId =
      typeof payload.documentId === 'string' ? payload.documentId : '';
    if (!documentId) {
      return { ok: false, message: 'documentId fehlt im Payload.' };
    }
    return {
      ok: true,
      message: 'Wir leiten dich zur Signaturseite weiter.',
      data: { redirectUrl: `/portal/sign/${encodeURIComponent(documentId)}` },
    };
  },
});
