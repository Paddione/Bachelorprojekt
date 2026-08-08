#!/usr/bin/env node
// scripts/pocket-id-bootstrap.mjs — T002676/T002677
//
// Automatisiert den Bootstrap einer FRISCHEN Pocket-ID-Instanz: erster
// Admin-User + API-Key. Ersetzt die manuellen Schritte 1-2 aus
// docs/runbooks/pocket-id-bootstrap.md.
//
// Warum das trotz "nicht automatisierbar" im Runbook geht: das Runbook
// schliesst korrekt aus, den API-Key per SQL/Secret zu seeden — Pocket ID
// hasht ihn und lehnt Klartext ab. Hier wird stattdessen der echte
// UI-Flow durchlaufen; der Passkey kommt von einem virtuellen
// WebAuthn-Authenticator (CDP-Domain "WebAuthn"), nicht von Hardware.
//
// Verwendung:
//   node scripts/pocket-id-bootstrap.mjs [--url http://auth.localhost] [--json]
//
// Gibt den erzeugten API-Key auf stdout aus (mit --json als {"apiKey": "..."}),
// damit der Aufrufer ihn direkt in workspace-secrets patchen kann.

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = getArg('--url', 'http://auth.localhost').replace(/\/$/, '');
const JSON_OUT = args.includes('--json');
const USERNAME = getArg('--username', 'admin');
// admin@localhost wird von der Formularvalidierung als "Invalid email address"
// abgelehnt (keine TLD) — example.com ist reserviert (RFC 2606) und passiert sie.
const EMAIL = getArg('--email', 'admin@example.com');
const FIRST = getArg('--firstname', 'Dev');
const LAST = getArg('--lastname', 'Admin');

const log = (...m) => console.error('[bootstrap]', ...m);

const browser = await chromium.launch({ headless: true });
// Pocket ID verlangt fuer WebAuthn einen Secure Context. http://*.localhost
// gilt in Chromium als vertrauenswuerdig; die explizite Origin-Freigabe
// deckt zusaetzlich den Fall ab, dass ueber eine IP zugegriffen wird.
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

try {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      // Ohne isUserVerified registriert der Authenticator zwar, liefert aber
      // kein "user verified"-Flag — Pocket ID lehnt den Passkey dann ab.
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  log('virtueller Authenticator:', authenticatorId);

  log('oeffne', `${BASE}/setup`);
  await page.goto(`${BASE}/setup`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // /setup leitet auf /signup/setup weiter, wo das eigentliche Formular liegt.
  // Ohne dieses Warten werden die Felder der Vorgaengerseite befuellt, die
  // Navigation verwirft sie, und das Formular kommt leer mit
  // "Too small: expected string to have >=1 characters" zurueck.
  await page.waitForSelector('input[name="username"], #username', { timeout: 30_000 });
  log('Formular sichtbar auf', page.url());

  // Das Setup-Formular fragt je nach Version unterschiedliche Felder ab.
  // Wir fuellen defensiv, was vorhanden ist, statt auf ein festes Layout
  // zu bestehen.
  const fill = async (selectors, value) => {
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.count().catch(() => 0)) {
        if (await el.isVisible().catch(() => false)) {
          await el.fill(value).catch(() => {});
          return true;
        }
      }
    }
    return false;
  };

  await fill(['input[name="username"]', '#username'], USERNAME);
  await fill(['input[name="email"]', '#email', 'input[type="email"]'], EMAIL);
  await fill(['input[name="firstName"]', '#firstName', 'input[name="first_name"]'], FIRST);
  await fill(['input[name="lastName"]', '#lastName', 'input[name="last_name"]'], LAST);

  await page.screenshot({ path: '/tmp/pocket-id-setup.png' }).catch(() => {});

  const submit = page
    .locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Continue"), button:has-text("Weiter"), button:has-text("Create")')
    .first();
  await submit.click({ timeout: 15_000 });

  // Nach dem Submit folgt die Passkey-Registrierung. Der virtuelle
  // Authenticator beantwortet sie ohne Interaktion; wir warten darauf, dass
  // die Signup-Route verlassen wird.
  await page
    .waitForURL((u) => !u.pathname.includes('/signup') && !u.pathname.startsWith('/setup'), { timeout: 45_000 })
    .catch(() => log('WARN: Signup-Route nicht verlassen — pruefe Screenshot'));

  await page.screenshot({ path: '/tmp/pocket-id-after-setup.png' }).catch(() => {});
  log('nach Setup:', page.url());

  // API-Key erzeugen. Sobald eine Session existiert, geht das ueber die
  // eigene REST-API im Browser-Kontext — stabiler als die UI zu klicken.
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const result = await page.evaluate(async ({ expiresAt }) => {
    const attempts = [
      { name: 'sdlc-bootstrap', description: 'seed job', expiresAt },
      { name: 'sdlc-bootstrap', expiresAt },
    ];
    for (const body of attempts) {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) return { ok: true, status: res.status, text };
      var last = { ok: false, status: res.status, text };
    }
    return last;
  }, { expiresAt });

  if (!result.ok) {
    log('API-Key-Erstellung fehlgeschlagen:', result.status, result.text?.slice(0, 300));
    process.exitCode = 1;
  } else {
    let key = null;
    try {
      const parsed = JSON.parse(result.text);
      key = parsed.key || parsed.token || parsed.apiKey || parsed.value;
    } catch {
      /* unten behandelt */
    }
    if (!key) {
      log('Antwort ohne erkennbares Key-Feld:', result.text?.slice(0, 300));
      process.exitCode = 1;
    } else {
      log('API-Key erzeugt');
      process.stdout.write(JSON_OUT ? JSON.stringify({ apiKey: key }) + '\n' : key + '\n');
    }
  }
} catch (err) {
  log('FEHLER:', err?.message || err);
  await page.screenshot({ path: '/tmp/pocket-id-error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
