import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';

registerAction({
  id: 'portal:upload-file',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const targetFolder =
      typeof payload.targetFolder === 'string' ? payload.targetFolder : '';
    return {
      targetLabel: targetFolder || 'Dateien',
      summary: targetFolder
        ? `Datei nach „${targetFolder}" hochladen.`
        : 'Datei hochladen.',
    };
  },
  // Uploads need a real multipart-form POST from the browser; the assistant
  // can't perform that round-trip. Redirect to the portal Dateien view instead
  // — the page enforces userSub scoping (PortalLayout requires a session).
  handler: async (): Promise<ActionResult> => ({
    ok: true,
    message: 'Wir öffnen deine Dateien — der Upload selbst läuft dort.',
    data: { redirectUrl: '/portal/dateien' },
  }),
});
