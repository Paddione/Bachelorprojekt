#!/usr/bin/env node
// scripts/sdlc-cockpit-smoke.mjs — T002677
//
// End-to-End-Nachweis fuer das lokale SDLC-Cockpit: meldet sich per
// One-Time-Access-Token bei Pocket ID an, laeuft den OIDC-Roundtrip zur
// Console und prueft, dass /sdlc/cockpit als angemeldeter Admin **gerendert**
// wird — nicht nur, dass es antwortet.
//
// Ein One-Time-Token statt Passkey, weil es serverseitig erzeugbar ist:
//   kubectl exec -n workspace <pocket-id-pod> -c pocket-id -- \
//     /app/pocket-id one-time-access-token paddione
//
// Verwendung:
//   node scripts/sdlc-cockpit-smoke.mjs --token-url http://auth.localhost/lc/XXXX
//   node scripts/sdlc-cockpit-smoke.mjs --token-url … --base http://web.localhost

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const TOKEN_URL = getArg('--token-url', '');
// web.localhost, nicht sdlc.localhost: nur dieser Host deckt sich mit der
// Callback-URL, die der pocket-id-client-seed-Job registriert.
const BASE = getArg('--base', 'http://web.localhost').replace(/\/$/, '');
const SHOT = getArg('--screenshot', '/tmp/sdlc-cockpit.png');

if (!TOKEN_URL) {
  console.error('FEHLER: --token-url fehlt.');
  process.exit(2);
}

const log = (...m) => console.error('[smoke]', ...m);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
// Konsolentexte nennen die URL nicht ("Failed to load resource"). Fuer die
// Diagnose zaehlt aber genau sie — welcher Endpunkt fehlt.
const failedRequests = [];
page.on('response', async (r) => {
  if (r.status() < 400) return;
  // Der Antwortkoerper nennt bei 500ern die eigentliche Ursache (die Cockpit-
  // Endpunkte geben {"error": "..."} zurueck); der Status allein sagt nichts.
  let detail = '';
  try {
    const t = await r.text();
    if (t && !t.startsWith('<!doctype')) detail = ` — ${t.slice(0, 160)}`;
  } catch { /* Body nicht mehr verfuegbar */ }
  failedRequests.push(`${r.status()} ${r.url()}${detail}`);
});

try {
  log('Login via One-Time-Token');
  await page.goto(TOKEN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  check('Pocket-ID-Login akzeptiert das One-Time-Token', !/\/lc\//.test(page.url()) || !(await page.locator('text=/invalid|expired|ungültig/i').count().catch(() => 0)), page.url());

  log('oeffne Cockpit:', `${BASE}/sdlc/cockpit`);
  let resp = await page.goto(`${BASE}/sdlc/cockpit`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  // Pocket ID zeigt beim ersten Login pro Client einen Consent-Screen
  // ("Sign in to website"), solange skip_consent nicht gesetzt ist. Der Flow
  // bleibt sonst auf /interaction stehen — kein Fehler, nur ein Klick.
  if (/\/interaction/.test(page.url())) {
    log('Consent-Screen — bestaetige');
    const consent = page.locator('button:has-text("Sign in"), button:has-text("Anmelden"), button[type="submit"]').first();
    await consent.click({ timeout: 15_000 }).catch((e) => log('Consent-Klick fehlgeschlagen:', e.message));
    await page.waitForURL((u) => !u.pathname.startsWith('/interaction'), { timeout: 45_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  }

  // Frischer Aufruf als bereits angemeldeter Nutzer: erst dieser Status ist
  // aussagekraeftig. Der aus dem ersten goto stammt noch aus der
  // Redirect-Kette vor dem Consent. Konsolenfehler zaehlen ab hier — die
  // 401er des Consent-Screens gehoeren nicht dem Cockpit.
  consoleErrors.length = 0;
  failedRequests.length = 0;
  resp = await page.goto(`${BASE}/sdlc/cockpit`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  const status = resp?.status() ?? 0;
  const url = page.url();
  check('OIDC-Roundtrip endet auf /sdlc/cockpit', /\/sdlc\/cockpit/.test(url), url);
  check('HTTP-Status 200', status === 200, String(status));
  check(
    'kein OAuth-Client-Fehler',
    !/OAuth 2\.0 Client does not exist/i.test(await page.content()),
  );

  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  check('Seite ist nicht leer', bodyText.trim().length > 200, `${bodyText.trim().length} Zeichen`);
  check('nicht auf der Login-Seite gelandet', !/\/login$/.test(url), url);

  await page.screenshot({ path: SHOT, fullPage: true }).catch(() => {});
  log('Screenshot:', SHOT);

  if (failedRequests.length) {
    log(`${failedRequests.length} fehlgeschlagene Requests:`);
    [...new Set(failedRequests)].slice(0, 20).forEach((e) => log('  ', e));
  }
  check(
    'alle Cockpit-Requests erfolgreich',
    failedRequests.length === 0,
    `${failedRequests.length} fehlgeschlagen`,
  );
} catch (err) {
  log('FEHLER:', err?.message || err);
  await page.screenshot({ path: '/tmp/sdlc-cockpit-error.png' }).catch(() => {});
  failures++;
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nALLE CHECKS BESTANDEN' : `\n${failures} CHECK(S) FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
