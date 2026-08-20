#!/usr/bin/env node
// scripts/dev-admin-session.mjs — lokale Admin-Session fuer den Astro-Dev-Server.
//
// Schreibt eine Zeile in web_sessions und gibt das Cookie aus, mit dem
// /sdlc/* ohne OIDC-Anmeldung erreichbar ist. Das ist ein Auth-Bypass und
// gehoert ausschliesslich in die lokale Entwicklung — deshalb die Guards
// unten: das Skript weigert sich gegen alles, was nicht localhost ist.
//
// Der regulaere Weg ist die Anmeldung ueber Pocket ID. Diesen hier gibt es,
// weil `auth.ts` mit `issueSession()` denselben Pfad schon fuer die
// System-Test-Nutzer oeffnet (Magic-Link-Redeem) und lokal kein Pocket ID
// erreichbar sein muss.
//
// Aufruf:
//   cd components/website && set -a && . ./.env && set +a
//   node ../../scripts/dev-admin-session.mjs
//
// Danach die ausgegebene Zeile im Browser als Cookie setzen (DevTools →
// Application → Cookies → http://localhost:4321), oder direkt:
//   curl -b "workspace_session=<ID>" http://127.0.0.1:4321/sdlc/cockpit

import { Client } from 'pg';
import crypto from 'node:crypto';

const url = process.env.SESSIONS_DATABASE_URL;
if (!url) {
  console.error('SESSIONS_DATABASE_URL ist nicht gesetzt.');
  console.error('Vorher:  set -a && . ./.env && set +a   (in components/website)');
  process.exit(2);
}

// Guard 1: nur lokale Datenbanken. Eine Session in einer Cluster-DB waere
// ein echter Zugang zu einer echten Umgebung, kein Entwicklungsbehelf.
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`Verweigert: SESSIONS_DATABASE_URL zeigt auf ${host}, nicht auf localhost.`);
  console.error('Dieses Skript schreibt eine Session ohne Anmeldung — das ist nur lokal vertretbar.');
  process.exit(2);
}

const username = process.env.DEV_ADMIN_USERNAME || 'patrick';
const email = process.env.DEV_ADMIN_EMAIL || 'p.korczewski@gmail.com';
const days = Number(process.env.DEV_ADMIN_SESSION_DAYS || 7);

const client = new Client({ connectionString: url });
await client.connect();

// Guard 2: die Tabelle muss existieren. Sie wird sonst von ensureSessionsTable()
// erst beim ersten Request angelegt — eine Session in eine gerade erfundene
// Tabelle zu schreiben verschleierte, dass der Server nie lief.
const { rows: [{ t }] } = await client.query("select to_regclass('public.web_sessions') as t");
if (!t) {
  console.error('web_sessions existiert nicht. Den Dev-Server einmal starten und eine Seite aufrufen,');
  console.error('damit ensureSessionsTable() die Tabelle anlegt.');
  await client.end();
  process.exit(2);
}

const id = crypto.randomBytes(32).toString('hex');
const expiresAt = Date.now() + days * 24 * 3600 * 1000;

// realmRoles: ['admin'] ist das Signal, das isAdmin() zuerst prueft
// (auth.ts:229). PORTAL_ADMIN_USERNAME waere der Fallback.
const user = {
  sub: `local-dev-${username}`,
  email,
  name: `${username} (lokal)`,
  preferred_username: username,
  realmRoles: ['admin'],
  brand: null,
  access_token: 'local-dev-no-oidc',
  refresh_token: 'local-dev-no-oidc',
  expires_at: expiresAt,
};

await client.query(
  'INSERT INTO web_sessions (id, data, expires_at) VALUES ($1, $2, $3)',
  [id, JSON.stringify(user), new Date(expiresAt)],
);
await client.end();

console.log(`Cookie:   workspace_session=${id}`);
console.log(`Nutzer:   ${username} (realmRoles: admin)`);
console.log(`Gueltig:  bis ${new Date(expiresAt).toISOString()}`);
console.log('');
console.log('Testen:');
console.log(`  curl -s -o /dev/null -w '%{http_code}\\n' -b "workspace_session=${id}" \\`);
console.log("    http://127.0.0.1:4321/sdlc/cockpit");
