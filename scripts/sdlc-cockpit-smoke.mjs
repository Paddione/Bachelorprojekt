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
// Uncaught-Exceptions (Svelte-Renderfehler landen hier, nicht im console) —
// faengt die Klasse "kompiliert still, crasht beim Render" (E4-Review-Befund).
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
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

  // [T008016/E4] KPI-Raster: frischer Aufruf ohne station/ticket landet in der
  // Idle-Kontextzone und muss das DORA-Raster zeigen. WICHTIG: VOR der
  // station-Navigation pruefen — mit ?station=implement zeigt die Kontextzone
  // den Factory-Floor statt des Idle-Rasters (Review-Befund: Check lief nach
  // der Navigation und konnte nie gruen werden).
  check(
    'KPI-Raster in der Idle-Kontextzone',
    (await page.locator('[data-testid="leitstand-kpi-grid"]').count()) > 0,
    'leitstand-kpi-grid',
  );

  // [T007957/Review-I2] Der Factory-Floor (Z4-Fertigungsansicht) mountet erst
  // bei einer Fertigungs-Station; auf der Default-Ansicht existieren die
  // Floor-testids nicht. Fuer die Stabilitaets-Checks auf die Implement-
  // Station navigieren — die Zonen-Shell (Z1/Z3/Z4/Z5) ist davon unberuehrt.
  resp = await page.goto(`${BASE}/sdlc/cockpit?station=implement`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  check(
    'Fertigungs-Ansicht nach ?station=implement',
    (await page.locator('[data-testid="factory-floor"]').count()) > 0,
    page.url(),
  );

  // [T007957/E3] Alte Floor-testids bleiben stabil (SSOT software-factory.md §
  // "FA-SF: Factory Floor Hallendarstellung" — INVARIANT, kein Delta in diesem Change).
  for (const id of ['factory-floor', 'floor-leitstand', 'floor-hall', 'floor-shipped', 'floor-slots']) {
    check(`testid stabil: ${id}`, (await page.locator(`[data-testid="${id}"]`).count()) > 0, id);
  }
  // floor-workpiece/floor-detail nur pruefen, wenn ein Workpiece vorhanden ist —
  // eine leere Halle ist kein Smoke-Fehler.
  const wp = page.locator('[data-testid="floor-workpiece"]').first();
  if (await wp.count()) {
    check('testid stabil: floor-workpiece', true);
    await wp.click({ timeout: 5_000 }).catch(() => {});
    check('testid stabil: floor-detail (nach Klick)', (await page.locator('[data-testid="floor-detail"]').count()) > 0);
  }

  // [T007957/E3] Neue Zonen-Selektoren sind vorhanden (Kontrakt C).
  for (const id of ['leitstand-statusband', 'leitstand-achse', 'leitstand-kontextzone', 'leitstand-deck-leiste']) {
    check(`Zone gerendert: ${id}`, (await page.locator(`[data-testid="${id}"]`).count()) > 0, id);
  }

  // [T008016/E4] MCP-Health als Admin erreichbar: page.request teilt sich die
  // Cookie-Jar des Contexts, die Session-Cookies fliessen mit.
  {
    const mcpRes = await page.request.get(`${BASE}/sdlc/api/mcp-health`);
    let mcpBody = null;
    try { mcpBody = await mcpRes.json(); } catch { /* koerper nicht JSON */ }
    check('MCP-Health antwortet mit fetchedAt', mcpRes.status() === 200 && typeof mcpBody?.fetchedAt === 'string', String(mcpRes.status()));
    if (mcpBody?.servers) {
      check('MCP-Health listet HTTP-MCP-Server', Array.isArray(mcpBody.servers) && mcpBody.servers.length > 0, `${mcpBody.servers.length} Server`);
    }
  }

  // [T008016/E4] Wissen-Deck: Katalog-Modul nach Deck-Wechsel gerendert.
  {
    const deckBtn = page.locator('[data-testid="deck-switch-wissen"]');
    if (await deckBtn.count()) {
      await deckBtn.click({ timeout: 10_000 }).catch((e) => log('Deck-Klick fehlgeschlagen:', e.message));
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    } else {
      log('deck-switch-wissen nicht gefunden');
    }
    check(
      'API-Katalog im Wissen-Deck gerendert',
      (await page.locator('[data-testid="leitstand-api-katalog"]').count()) > 0,
      'leitstand-api-katalog',
    );
    check(
      'MCP-Health-Zeile im Katalog gerendert',
      (await page.locator('[data-testid="leitstand-mcp-health"]').count()) > 0,
      'leitstand-mcp-health',
    );
  }

  // [T008016/E4/Review] Plattform-Deck per URL — ?deck=plattform ist das
  // Redirect-Ziel von /sdlc/observability und deckt die Fehlerklasse
  // "kompiliert still, crasht beim Render" ab (Review-Befund: undeklarierte
  // $state-Referenzen; pageerror faengt die Klasse seit dem Fix hier ab).
  {
    await page.goto(`${BASE}/sdlc/cockpit?deck=plattform`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    check(
      'Plattform-Deck per ?deck=plattform gerendert',
      (await page.locator('[data-testid="deck-panel-plattform"]').count()) > 0,
      'deck-panel-plattform',
    );
    check(
      'Cluster-Karte im Plattform-Deck',
      (await page.locator('[data-testid="deck-plattform-cluster"]').count()) > 0,
      'deck-plattform-cluster',
    );
    check(
      'Deployment-Karten aus k8s.ts-Route',
      (await page.locator('[data-testid="deck-plattform-deployments"]').count()) > 0,
      'deck-plattform-deployments',
    );
    check(
      'Pod-Statistik im Plattform-Deck',
      (await page.locator('[data-testid="deck-plattform-pods"]').count()) > 0,
      'deck-plattform-pods',
    );
  }

  // [T008017/E5] Help-Overlay: der [?]-Toggle im Statusband traegt eine
  // testid (Anker fuer Overlay-Checks); ?report=1 setzt die .report-Klasse
  // am Shell-Root (Export-Vorschau der Print-Darstellung).
  check('Help-Toggle-testid vorhanden', (await page.locator('[data-testid="leitstand-help-toggle"]').count()) > 0);

  const reportResp = await page.goto(`${BASE}/sdlc/cockpit?report=1`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  check(
    '?report=1 setzt .report-Klasse am Shell-Root',
    (await page.locator('#cockpit-root.report').count()) > 0,
    `HTTP ${reportResp?.status() ?? 0}`,
  );

  // [T008017/E5] Absorptions-Redirects: die drei Satelliten-Pfade antworten
  // 301 auf ihr Deck-Ziel. Geprueft wird die SEMANTIK (Location-Header-Wert),
  // nicht ein Format-Anker (T002716). Die Middleware redirectet vor dem
  // Auth-Gate, daher ist kein Session-Kontext noetig.
  const redirectCases = [
    ['/sdlc/repohealth', '/sdlc/cockpit?deck=qualitaet'],
    ['/sdlc/prompts', '/sdlc/cockpit?deck=wissen'],
    ['/sdlc/ki-konfiguration', '/sdlc/cockpit?deck=ki'],
  ];
  for (const [from, to] of redirectCases) {
    try {
      const rr = await context.request.get(`${BASE}${from}`, { maxRedirects: 0, timeout: 15_000 });
      const loc = rr.headers()['location'] ?? '(keine)';
      check(`301 ${from} -> ${to}`, rr.status() === 301 && loc === to, `Status ${rr.status()}, Location ${loc}`);
    } catch (e) {
      check(`301 ${from} -> ${to}`, false, e?.message || 'Request-Fehler');
    }
  }

  await page.screenshot({ path: SHOT, fullPage: true }).catch(() => {});
  log('Screenshot:', SHOT);

  if (failedRequests.length) {
    log(`${failedRequests.length} fehlgeschlagene Requests:`);
    [...new Set(failedRequests)].slice(0, 20).forEach((e) => log('  ', e));
  }
  // Strikte Schlusschecks, scoped auf den SDLC-Build-Vertrag:
  // (1) Render-Crash-Klasse — jede pageerror (Svelte-ReferenceError etc.;
  //     genau der E4-Review-Befund) faerbt den Smoke rot.
  // (2) /sdlc/-Requests muessen alle erfolgreich sein. Der 404 auf
  //     /api/portal/questionnaires zaehlt NICHT: PortalSidekick fragt das
  //     Portal-Modul an, das der SDLC-Build (BUILD_TARGET=sdlc) bewusst nicht
  //     enthaelt — kein SDLC-Vertrag, kein Portal-Backend im Dev-Stack.
  // (3) Konsolenfehler rot, ausser 'Failed to load resource' — das ist nur
  //     das Browser-Echo der HTTP-Fehler, die (2) bereits zaehlt.
  const pageErrors = consoleErrors.filter((e) => e.startsWith('pageerror:'));
  const sdlcFailures = failedRequests.filter((r) => r.includes('/sdlc/'));
  const strayConsole = consoleErrors.filter(
    (e) => !e.startsWith('pageerror:') && !e.includes('Failed to load resource'),
  );
  check(
    'alle /sdlc/-Requests erfolgreich',
    sdlcFailures.length === 0,
    `${sdlcFailures.length} fehlgeschlagen`,
  );
  if (pageErrors.length || strayConsole.length) {
    log(`${pageErrors.length} pageerror(s), ${strayConsole.length} sonstige Konsolenfehler:`);
    [...new Set([...pageErrors, ...strayConsole])].slice(0, 20).forEach((e) => log('  ', e));
  }
  check(
    'keine Render-Crashs oder Konsolenfehler im Cockpit',
    pageErrors.length === 0 && strayConsole.length === 0,
    `${pageErrors.length + strayConsole.length} Fehler`,
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
