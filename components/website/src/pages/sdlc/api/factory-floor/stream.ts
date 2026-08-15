import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { getPlanningCount } from '../../../../lib/sdlc/factory-floor';
import { STREAM_POLL_MS, STREAM_HEARTBEAT_MS } from '../../../../lib/factory-constants.ts';
import { subscribe, isListening } from '../../../../lib/sdlc/cockpit-listen-hub';

export const prerender = false;

// E4 (T008016): Der Factory-Floor-Stream wird primär von LISTEN/NOTIFY über
// den cockpit-listen-hub getrieben — ein DB-Abfrage-setInterval ist nur noch
// FALLBACK, solange keine NOTIFY-Verbindung verfügbar ist (isListening-Watchdog).
// Reconnect-Events des Hubs erzwingen eine Voll-Snapshot-Zustellung, weil
// während einer Hub-Pause Events verloren gehen können.
const WATCHDOG_SILENCE_MS = 20_000;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let lastMax = '';
  let lastHubEventAt = 0;
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Daten-Refresh: einmal pro Hub-Event (oder Fallback-Poll). Sendet nur
      // bei neuem MAX(at) — identisches LastMax ergibt kein redundantes Event.
      // source unterscheidet initialen Prime, LISTEN-Event und Reconnect —
      // nur ein echter Reconnect darf sich 'listen-reconnect' nennen (m3/Review).
      const refresh = async (
        force = false,
        source: 'listen' | 'listen-reconnect' | 'initial' = force ? 'listen-reconnect' : 'listen',
      ) => {
        try {
          const [phaseRow, planningCount] = await Promise.all([
            pool.query(`SELECT COALESCE(MAX(at)::text, '') AS m FROM tickets.factory_phase_events`),
            getPlanningCount(),
          ]);
          const m = phaseRow.rows[0]?.m ?? '';
          if (force || (m && m !== lastMax)) {
            lastMax = m;
            send('phase', { at: m, planningCount, source });
          }
        } catch {
          /* swallow — heartbeat keeps stream alive */
        }
      };

      // Fallback-Poll: läuft NUR ohne NOTIFY-Verbindung (isListening-Watchdog).
      const fallbackPoll = async () => {
        try {
          const [phaseRow, planningCount] = await Promise.all([
            pool.query(`SELECT COALESCE(MAX(at)::text, '') AS m FROM tickets.factory_phase_events`),
            getPlanningCount(),
          ]);
          const m = phaseRow.rows[0]?.m ?? '';
          if (m && m !== lastMax) {
            lastMax = m;
            send('phase', { at: m, planningCount, source: 'fallback' });
          }
        } catch {
          /* swallow — heartbeat keeps stream alive */
        }
      };

      const stopFallbackPoll = () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };

      const onHubEvent = (ev: { domain: string }) => {
        lastHubEventAt = Date.now();
        stopFallbackPoll();
        // reconnect => Events verpasst => Voll-Snapshot erzwingen.
        void refresh(ev.domain === 'reconnect');
      };

      // Watchdog: ist keine NOTIFY-Verbindung verfuegbar (isListening() false),
      // startet nach WATCHDOG_SILENCE_MS der Fallback-Poll — die Spec bindet
      // den Poll an die VERFUEGBARKEIT der Verbindung, nicht an Event-Stille
      // (ein ruhiger Floor ist der Normalfall und darf nicht pollen). Die
      // erste Hub-Regung stoppt den Poll wieder; lastHubEventAt startet bei 0,
      // damit auch ein nie verbundener Hub den Fallback ausloest.
      const watchdog = () => {
        if (!isListening() && Date.now() - lastHubEventAt >= WATCHDOG_SILENCE_MS && !pollTimer) {
          void fallbackPoll();
          pollTimer = setInterval(fallbackPoll, STREAM_POLL_MS);
        }
      };

      // Prime: Start-Snapshot mit source 'initial' (kein Reconnect), dann
      // LISTEN-Abo.
      void refresh(true, 'initial');
      unsub = subscribe(onHubEvent);
      watchdogTimer = setInterval(watchdog, STREAM_POLL_MS);
      beatTimer = setInterval(() => send('heartbeat', { t: Date.now() }), STREAM_HEARTBEAT_MS);

      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer);
        if (watchdogTimer) clearInterval(watchdogTimer);
        if (beatTimer) clearInterval(beatTimer);
        if (unsub) { unsub(); unsub = null; }
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (pollTimer) clearInterval(pollTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (beatTimer) clearInterval(beatTimer);
      if (unsub) { unsub(); unsub = null; }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
};
