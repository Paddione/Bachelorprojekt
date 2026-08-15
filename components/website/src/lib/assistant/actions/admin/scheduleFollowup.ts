// website/src/lib/assistant/actions/admin/scheduleFollowup.ts
import { registerAction } from '../../actions';
import { createCalendarEvent } from '../../../caldav';
import { getCustomerFullById } from '../../../website-db';

const DEFAULT_DURATION_MIN = 60;

registerAction({
  id: 'admin:schedule-followup',
  allowedProfiles: ['admin'],
  describe: (payload) => {
    const datetime = String(payload.datetime ?? '');
    const serviceId = typeof payload.serviceId === 'string' ? payload.serviceId : '';
    const targetLabel = datetime
      ? `Folgetermin am ${datetime}${serviceId ? ` (${serviceId})` : ''}`
      : 'Folgetermin';
    return {
      targetLabel,
      summary: `Legt einen Folgetermin im Kalender (CalDAV) an${serviceId ? ` für die Leistung \"${serviceId}\"` : ''} und lädt den Klienten per E-Mail ein.`,
    };
  },
  handler: async ({ payload }) => {
    const clientId = typeof payload.clientId === 'string' ? payload.clientId : '';
    const datetime = typeof payload.datetime === 'string' ? payload.datetime : '';
    const serviceId = typeof payload.serviceId === 'string' ? payload.serviceId : '';

    if (!clientId) return { ok: false, message: 'Keine clientId angegeben.' };
    if (!datetime) return { ok: false, message: 'Kein Termin (datetime) angegeben.' };

    const start = new Date(datetime);
    if (Number.isNaN(start.getTime())) {
      return { ok: false, message: `Ungültiges Datumsformat: \"${datetime}\".` };
    }
    const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);

    let client;
    try {
      client = await getCustomerFullById(clientId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
      return { ok: false, message: `Klient konnte nicht geladen werden: ${msg}` };
    }
    if (!client) return { ok: false, message: `Klient ${clientId} nicht gefunden.` };

    try {
      const summary = serviceId
        ? `Folgetermin: ${serviceId} mit ${client.name}`
        : `Folgetermin mit ${client.name}`;
      const result = await createCalendarEvent({
        summary,
        description: `Folgetermin via Mentolder-Assistent.${serviceId ? `\nLeistung: ${serviceId}` : ''}`,
        start,
        end,
        attendeeEmail: client.email,
        attendeeName: client.name,
      });
      if (!result) {
        return { ok: false, message: 'Kalendereintrag konnte nicht erstellt werden (CalDAV-Fehler).' };
      }
      return {
        ok: true,
        message: `Folgetermin am ${start.toLocaleString('de-DE')} mit ${client.name} angelegt.`,
        data: { uid: result.uid, clientId, datetime, serviceId },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
      return { ok: false, message: `Termin-Erstellung fehlgeschlagen: ${msg}` };
    }
  },
});
