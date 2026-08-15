import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

registerAction({
  id: 'portal:start-questionnaire',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const questionnaireId =
      typeof payload.questionnaireId === 'string' ? payload.questionnaireId : '';
    return {
      targetLabel: questionnaireId
        ? `Fragebogen ${questionnaireId}`
        : 'Fragebogen starten',
      summary: 'Fragebogen im Portal öffnen.',
    };
  },
  // Redirect-only: /portal/fragebogen/[assignmentId] enforces ownership
  // server-side (session-bound assignment lookup), so returning the URL is safe.
  handler: async ({ payload }): Promise<ActionResult> => {
    const questionnaireId =
      typeof payload.questionnaireId === 'string' ? payload.questionnaireId : '';
    if (!questionnaireId) {
      return { ok: false, message: 'questionnaireId fehlt im Payload.' };
    }
    return {
      ok: true,
      message: 'Wir öffnen den Fragebogen.',
      data: {
        redirectUrl: `/portal/fragebogen/${encodeURIComponent(questionnaireId)}`,
      },
    };
  },
});
