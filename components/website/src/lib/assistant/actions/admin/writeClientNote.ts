// website/src/lib/assistant/actions/admin/writeClientNote.ts
import { registerAction } from '../../actions';
import { createClientNote } from '../../../website-db';

registerAction({
  id: 'admin:write-client-note',
  allowedProfiles: ['admin'],
  describe: (payload) => {
    const clientId = String(payload.clientId ?? '');
    const body = typeof payload.body === 'string' ? payload.body : '';
    const preview = body.length > 60 ? `${body.slice(0, 57)}...` : body;
    return {
      targetLabel: clientId ? `Klientennotiz für ${clientId}` : 'Klientennotiz',
      summary: `Speichert eine Notiz im Klienten-Dossier${preview ? `: \"${preview}\"` : ''}.`,
    };
  },
  handler: async ({ payload }) => {
    const clientId = typeof payload.clientId === 'string' ? payload.clientId : '';
    const body = typeof payload.body === 'string' ? payload.body : '';

    if (!clientId) return { ok: false, message: 'Keine clientId angegeben.' };
    if (!body.trim()) return { ok: false, message: 'Keine Notiz (body) angegeben.' };

    try {
      const note = await createClientNote(clientId, body);
      return {
        ok: true,
        message: `Notiz für Klient ${clientId} gespeichert.`,
        data: { id: note.id, createdAt: note.createdAt.toISOString?.() ?? String(note.createdAt) },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
      return { ok: false, message: `Notiz konnte nicht gespeichert werden: ${msg}` };
    }
  },
});
