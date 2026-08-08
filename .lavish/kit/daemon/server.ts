// server.ts — SDLC Cockpit Daemon (K2)
// Start: npx tsx .lavish/kit/daemon/server.ts
// Stop:  kill $(cat /tmp/cockpit-daemon.pid)

import fs from 'node:fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { generateToken, writeTokenFile } from './lib/token';
import { auditMiddleware } from './lib/token';
import { portfolioHandler, featureHandler } from './routes/cockpit';
import { podsListHandler, warningsHandler } from './routes/cluster';
import { factoryStatusHandler } from './routes/factory';
import { agentsHandler, ciHandler, modelsHandler } from './routes/custom';
import { epicsHandler, epicsChangesSinceHandler } from './routes/epics';
import { stylesHandler } from './routes/styles';
import { agentStreamHandler, factoryStreamHandler } from './routes/stream';

// 39152 statt des IANA-dynamic range: Windows/Hyper-V reserviert auf WSL2-Hosts
// blockweise Portbereiche ab 49152 (`netsh interface ipv4 show excludedportrange
// protocol=tcp` weist u.a. 49152-49251 aus). Ein bind() dort liefert EADDRINUSE,
// OBWOHL `ss -ltnp` niemanden zeigt und kein Prozess laeuft — der Daemon war
// damit auf jedem WSL2-Rechner unstartbar [T002708]. Auf einem Linux-CI-Runner
// existiert die Reservierung nicht, weshalb CI den Defekt nie sehen konnte.
//
// 39152 liegt ausserhalb dieser Bloecke und ausserhalb des lokalen
// Ephemeral-Range (/proc/sys/net/ipv4/ip_local_port_range). Wer den Wert wieder
// in den "IANA-dynamic range" zurueckziehen will — genau diese Begruendung stand
// hinter dem alten 49152 — liest zuerst T002708.
const PORT = parseInt(process.env.COCKPIT_DAEMON_PORT || '39152', 10);
const token = generateToken();

// Write token file with tight permissions BEFORE starting server
writeTokenFile('/tmp/cockpit-daemon.token', token);

// Write PID file
fs.writeFileSync('/tmp/cockpit-daemon.pid', String(process.pid));

const app = new Hono();

// CORS: allow the file:// origin of lavish pages and localhost
app.use('*', cors({
  origin: ['null', 'http://localhost:*', 'http://127.0.0.1:*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Authorization', 'Content-Type'],
}));

// Audit middleware for write endpoints
app.use('/api/cockpit/ticket-action', auditMiddleware(token));
app.use('/api/cockpit/agent-action', auditMiddleware(token));

// ----- Routes -----

// Admin Cockpit (mirrors website/src/pages/api/admin/cockpit/)
app.get('/api/admin/cockpit/portfolio', portfolioHandler);
app.get('/api/admin/cockpit/feature', featureHandler);

// Admin Cluster (mirrors website/src/pages/api/admin/cluster/)
app.get('/api/admin/cluster/pods-list', podsListHandler);
app.get('/api/admin/cluster/warnings', warningsHandler);

// Admin Factory
app.get('/api/admin/factory-control', factoryStatusHandler);

// Custom Cockpit Endpoints (new)
app.get('/api/cockpit/agents', agentsHandler);
app.get('/api/cockpit/ci', ciHandler);
app.get('/api/cockpit/models', modelsHandler);

// K5 Epic-Canvas (T002464). Beide Routen sind lesend — der Canvas-Export
// schreibt NICHT serverseitig: die Canvas-Daten liegen ohnehin im Browser
// (IndexedDB), und ein Schreibpfad ins Dateisystem gehoert hinter die Auth, die
// erst K4 entwirft (siehe den T002505-Block weiter unten).
app.get('/api/cockpit/epics', epicsHandler);
app.get('/api/cockpit/epics/:id/changes-since', epicsChangesSinceHandler);

// K9 Stil-Datenbank (T002468) — Gestaltungsquelle für die Modelle. Lesend.
app.get('/api/cockpit/styles', stylesHandler);

// T002505: Hier stand ein Endpoint, der den Token unauthentifiziert per HTTP
// herausgab:
//     app.get('/api/cockpit/token', (c) => c.json({ token }));
// Damit waren die 0600-Rechte der Token-Datei wirkungslos — wer den Daemon
// erreichte, bekam den Token einfach geliefert. Und erreichbar ist er auch aus
// dem Browser: die CORS-Konfiguration oben erlaubt Origin 'null', und genau den
// sendet ein sandboxed iframe, das eine beliebige fremde Seite einbetten kann.
//
// Der Token bleibt bestehen und wird weiter nach /tmp/cockpit-daemon.token mit
// 0600 geschrieben (siehe oben). Wer ihn braucht, liest ihn dort — also auf
// einem Weg, der bereits eine Berechtigung voraussetzt. Der Browser-Adapter
// kann das nicht und hat deshalb keine Schreibrechte mehr; die Write-Endpunkte
// sind ohnehin noch Stubs (siehe unten, "real implementation in K4"). Eine
// echte Auth fuer den Browser gehoert in K4 entworfen, nicht durch die
// Hintertuer eines offenen Token-Endpoints ersetzt.

// SSE Streams
app.get('/api/cockpit/stream/agents', agentStreamHandler);
app.get('/api/cockpit/stream/factory', factoryStreamHandler);

// Write stubs (token-protected, real implementation in K4)
app.post('/api/cockpit/ticket-action', (c) => c.json({ ok: true, message: 'Write actions in K4' }));
app.post('/api/cockpit/agent-action', (c) => c.json({ ok: true, message: 'Write actions in K4' }));

// Health
//
// fetchedAt gehoert auch hier hin (D12): der Cockpit-Adapter liest den
// Zeitstempel aus JEDER Antwort, um das Alter der Anzeige zu bestimmen. Ohne das
// Feld kann er fuer /health nur die Anfragezeit annehmen — und genau diese Luecke
// blieb unbemerkt, solange der Test dazu geskippt wurde [T002508].
// `root` ist der Checkout, aus dem dieser Daemon gestartet wurde [T002464].
//
// Ohne dieses Feld kann ein Test nicht feststellen, OB der Daemon, der ihm
// antwortet, den Code traegt, den er gerade prueft. Auf dem Standardport laeuft
// leicht noch ein Daemon aus einem anderen Worktree — dann misst die Suite
// dessen Stand. Beobachtet an genau diesem Ticket: ein 3,8 h alter Daemon aus
// .worktrees/cockpit-daemon-runtime-T002508 lieferte 404 fuer eine Route, die
// im gepruefen Checkout laengst registriert war.
//
// Die Blickrichtung ist dieselbe wie bei T002508: dort war die Suite blind,
// weil sie bedingungslos skippte; hier waere sie blind, weil sie den falschen
// Prozess befragt. Beides sieht in bats nach einem Ergebnis aus.
app.get('/health', (c) => c.json({
  status: 'ok',
  uptime: process.uptime(),
  root: process.cwd(),
  fetchedAt: new Date().toISOString(),
}));

// Die Startmeldung gehoert in den listen-Callback, nicht davor [T002708]. Sie
// stand frueher ueber dem serve()-Aufruf und meldete damit Erfolg, bevor
// ueberhaupt gebunden wurde. Bei einem fehlgeschlagenen bind entstand dadurch
// die Ausgabe "listening on ..." unmittelbar gefolgt von EADDRINUSE auf genau
// diesem Port — ein Bild, das wie ein doppelter bind() im selben Prozess
// aussieht und die Fehlersuche in T002708 zunaechst genau dorthin geschickt hat.
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`[cockpit-daemon] listening on http://127.0.0.1:${info.port}`);
  console.log(`[cockpit-daemon] token at /tmp/cockpit-daemon.token (0600)`);
  console.log(`[cockpit-daemon] pid ${process.pid}`);
});

// Ein belegter oder reservierter Port ist ein Bedienfehler, kein Programmfehler —
// er verdient eine Anweisung statt eines Stacktraces. Alle anderen Fehler werden
// unveraendert weitergereicht, damit dieser Handler keine echten Defekte
// verschluckt.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') { throw err; }
  console.error(
    `[cockpit-daemon] FEHLER: Port ${PORT} auf 127.0.0.1 ist belegt oder reserviert (EADDRINUSE).\n` +
    `  Laeuft bereits ein Daemon?      ss -ltnp | grep ${PORT}\n` +
    `  Auf WSL2 kann der Port auch OHNE Lauscher reserviert sein:\n` +
    `    netsh.exe interface ipv4 show excludedportrange protocol=tcp\n` +
    `  Anderen Port waehlen:           COCKPIT_DAEMON_PORT=<frei> npx tsx .lavish/kit/daemon/server.ts`
  );
  process.exit(1);
});
