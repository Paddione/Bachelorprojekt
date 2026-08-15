// website/src/lib/assistant/actions/admin/finalizeMeeting.ts
import { registerAction } from '../../actions';
import { updateMeetingStatus } from '../../../website-db';

registerAction({
  id: 'admin:finalize-meeting',
  allowedProfiles: ['admin'],
  describe: (payload) => {
    const meetingId = String(payload.meetingId ?? '');
    const meetingLabel = typeof payload.meetingLabel === 'string' && payload.meetingLabel
      ? payload.meetingLabel
      : `Meeting ${meetingId.slice(0, 8) || '?'}`;
    return {
      targetLabel: meetingLabel,
      summary: `Markiert das Meeting als finalisiert (Status \"finalized\") und schließt damit den Coaching-Termin in der Datenbank ab.`,
    };
  },
  handler: async ({ payload }) => {
    const meetingId = typeof payload.meetingId === 'string' ? payload.meetingId : '';
    if (!meetingId) {
      return { ok: false, message: 'Keine meetingId angegeben.' };
    }
    try {
      await updateMeetingStatus(meetingId, 'finalized', { endedAt: new Date() });
      return {
        ok: true,
        message: `Meeting ${meetingId} wurde als finalisiert markiert.`,
        data: { meetingId, status: 'finalized' },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
      return { ok: false, message: `Finalisierung fehlgeschlagen: ${msg}` };
    }
  },
});
