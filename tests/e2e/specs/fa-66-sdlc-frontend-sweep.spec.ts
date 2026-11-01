import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// FA-66: SDLC-Frontend-Sweep — jede /sdlc/*-Seite rendert für einen Admin
// ohne Login-Redirect, ohne Seitenfehler, ohne horizontalen Overflow und ohne
// Platzhalter-Texte (undefined / NaN / [object Object]) — auf Desktop UND
// Mobil. Pro Lauf entsteht je Seite und Viewport ein Screenshot (Anhang).
//
// SDLC-Oberflächen sind Development-only (FA-61 bewacht, dass sie im
// Prod-Build fehlen). Dieser Test läuft deshalb nur gegen einen Dev-Server
// und ist ohne die beiden Env-Variablen ein Skip:
//
//   SDLC_E2E_URL      Basis-URL des Dev-Servers, z. B. http://127.0.0.1:4321
//   SDLC_E2E_SESSION  Wert des Cookies `workspace_session` einer Admin-Session
//                     aus der Sessions-DB dieses Dev-Servers (Wegwerf-DB,
//                     niemals eine Cluster-DB).
//
// Backend-Fehler (500/503 von /sdlc/api/*) gelten NICHT als Testfehler: ein
// lokaler Dev-Server hat weder Cluster noch Ticket-DB. Sie werden als
// Annotation protokolliert; die Seite muss trotzdem sauber rendern.
const BASE = process.env.SDLC_E2E_URL;
const SESSION = process.env.SDLC_E2E_SESSION;

const ROUTES: { path: string; title: RegExp }[] = [
  { path: '/sdlc/cockpit', title: /SDLC Leitstand/ },
  { path: '/sdlc/cockpit?report=1', title: /SDLC Leitstand/ },
  { path: '/sdlc/design-system', title: /Leitstand Design System/ },
  { path: '/sdlc/platform', title: /Platform Control Center/ },
  { path: '/sdlc/architektur', title: /Architektur/ },
  { path: '/sdlc/app-catalog', title: /App-Katalog/ },
  { path: '/sdlc/training', title: /LLM Training/ },
  { path: '/sdlc/software-history', title: /Komponenten-Registrierung/ },
  // Feature-Flag aus: die Seite fällt auf das Admin-Dashboard zurück.
  { path: '/sdlc/systemtest/board', title: /Admin/ },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

// axe-Befund-Helfer (Vorbild a11y-axe.spec.ts:17-44, gekürzt): nur
// critical/serious blockieren, Ausgabe mit Route + IDs + Targets für B3.
const SERIOUS = new Set(['critical', 'serious']);

interface AxeNodeSummary {
  target: string[];
  failureSummary: string;
}

interface AxeViolationSummary {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeNodeSummary[];
}

function describeViolations(violations: AxeViolationSummary[]): string {
  return violations
    .map((v) => [
      `· ${v.id} (${v.impact ?? 'unknown'}) — ${v.help}`,
      `  ${v.helpUrl}`,
      ...v.nodes.map((n) => `  - ${n.target.join(' ')} :: ${n.failureSummary.replace(/\n/g, ' | ')}`),
    ].join('\n'))
    .join('\n');
}

test.describe('FA-66: SDLC-Frontend-Sweep', { tag: ['@website', '@sdlc'] }, () => {
  test.skip(!BASE || !SESSION, 'SDLC_E2E_URL und SDLC_E2E_SESSION nötig (Dev-Server mit Wegwerf-Sessions-DB)');
  test.setTimeout(90_000);

  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const route of ROUTES) {
      test(`${vpName} ${route.path} rendert sauber`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({ viewport, locale: 'de-DE' });
        await context.addCookies([{ name: 'workspace_session', value: SESSION!, url: BASE! }]);
        const page = await context.newPage();

        const pageErrors: string[] = [];
        const backendFailures: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(String(e)));
        page.on('response', (r) => {
          if (r.status() >= 400) backendFailures.push(`${r.status()} ${new URL(r.url()).pathname}`);
        });

        const resp = await page.goto(BASE! + route.path, { waitUntil: 'load', timeout: 60_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

        // T1: Seite wurde ausgeliefert, kein Login-Redirect (Session greift).
        expect(resp?.status(), 'HTTP-Status der Seite').toBe(200);
        expect(new URL(page.url()).pathname, 'kein Login-Redirect').not.toBe('/login');

        // T2: richtige Seite (Titel).
        await expect(page).toHaveTitle(route.title);

        // T3: kein ungefangener JS-Fehler.
        expect(pageErrors, 'ungefangene Seitenfehler').toEqual([]);

        // T4: kein horizontaler Overflow.
        const overflow = await page.evaluate(() => {
          const de = document.documentElement;
          return { scrollW: de.scrollWidth, clientW: de.clientWidth };
        });
        expect(overflow.scrollW, `horizontaler Overflow (${overflow.scrollW}px > ${overflow.clientW}px)`)
          .toBeLessThanOrEqual(overflow.clientW + 1);

        // T5: keine Platzhalter-Texte im sichtbaren Inhalt.
        const body = await page.evaluate(() => document.body.innerText);
        const bad = [...new Set([...body.matchAll(/\b(undefined|NaN|\[object Object\])\b/g)].map((m) => m[0]))];
        expect(bad, 'Platzhalter-Texte im Inhalt').toEqual([]);

        // T6 (axe, nur Desktop — Aufwand begrenzen): 0 critical/serious
        // (wcag2a/wcag2aa/wcag21a/wcag21aa). Befunde über Triviales hinaus
        // werden NICHT hier gefixt (B3), sondern landen mit Route + IDs +
        // Screenshot-Pfad in phase-events.log für den PR-Body.
        if (vpName === 'desktop') {
          await page.emulateMedia({ reducedMotion: 'reduce' });
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? '')) as AxeViolationSummary[];
          const summary = blocking.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join('\n');
          expect(blocking.length, `${route.path}\n${summary}\n\n${describeViolations(blocking)}`).toBe(0);
        }

        if (backendFailures.length) {
          testInfo.annotations.push({ type: 'backend-failures', description: [...new Set(backendFailures)].join(', ') });
        }
        await testInfo.attach(`${vpName}${route.path.replace(/[^a-z0-9]+/gi, '_')}.png`, {
          body: await page.screenshot({ fullPage: false }),
          contentType: 'image/png',
        });
        await context.close();
      });
    }
  }
});
