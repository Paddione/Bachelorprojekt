import { registerAction } from '../../actions';
import type { ActionResult } from '../../types';
import { getClientFolderPath, listFiles, createShareLink } from '../../../nextcloud-files';

registerAction({
  id: 'portal:share-file',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const fileName = typeof payload.fileName === 'string' ? payload.fileName : '';
    const preview = fileName.length > 60 ? `${fileName.slice(0, 57)}…` : fileName;
    return {
      targetLabel: 'Link teilen',
      summary: preview
        ? `Freigabe-Link für „${preview}" erstellen.`
        : 'Freigabe-Link für eine Datei erstellen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    const fileName = typeof ctx.payload.fileName === 'string' ? ctx.payload.fileName.trim() : '';
    if (!fileName) {
      return { ok: false, message: 'Bitte gib den Namen der Datei an, für die du einen Link erstellen möchtest.' };
    }

    const username = ctx.preferredUsername || ctx.userSub;
    if (!username) {
      return { ok: false, message: 'Deine Nutzerdaten konnten nicht ermittelt werden. Bitte melde dich erneut an.' };
    }

    const folderPath = getClientFolderPath(username);
    const files = await listFiles(folderPath);
    if (files.length === 0) {
      return {
        ok: false,
        message: `In deinem Dateibereich (${folderPath}) wurden keine Dateien gefunden.`,
      };
    }

    const normalizedQuery = fileName.toLowerCase();
    const match = files.find((f) => f.name.toLowerCase() === normalizedQuery)
      || files.find((f) => f.name.toLowerCase().includes(normalizedQuery))
      || null;

    if (!match) {
      const fileList = files.map((f) => `• ${f.name}`).slice(0, 10).join('\n');
      const moreMsg = files.length > 10 ? `\n… und ${files.length - 10} weitere.` : '';
      return {
        ok: false,
        message: `Keine Datei gefunden, die auf „${fileName}" passt.\n\nDeine Dateien in Nextcloud:\n${fileList}${moreMsg}`,
      };
    }

    const filePath = `${folderPath}${match.name}`;
    const shareUrl = await createShareLink(filePath);
    if (!shareUrl) {
      return { ok: false, message: `Der Freigabe-Link für „${match.name}" konnte nicht erstellt werden. Bitte versuche es erneut.` };
    }

    return {
      ok: true,
      message: `Freigabe-Link für „${match.name}" erstellt:\n\n${shareUrl}\n\nDu kannst diesen Link jetzt kopieren und teilen.`,
      data: { fileName: match.name, shareUrl },
    };
  },
});
