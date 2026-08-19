import { test, expect } from '@playwright/test';

/**
 * K8: Agentische Headed-Tests (T002467)
 *
 * EXPLIZIT OPTIONAL — KEIN CI-GATE.
 *
 * Dieses Spec ist absichtlich NICHT in tests/e2e/playwright.config.ts registriert
 * (keine testMatch-Zuordnung zu einem Playwright-`project`) und trägt keinen
 * `@smoke`/`@<feature>`-Tag. Dadurch wird es:
 *   - von `npx playwright test` (nächtlicher e2e.yml-Lauf, alle Projects) NICHT erfasst,
 *   - von e2e-pr.yml's `--grep @smoke|@<tag>`-Filter NICHT erfasst,
 *   - selbst wenn e2e-pr.yml diese Datei wegen Änderung explizit als Positionsargument
 *     übergibt, greift zusätzlich der CI-Guard unten (test.skip bei process.env.CI).
 *
 * Ausführung ist ausschließlich manuell/agentisch vorgesehen — siehe
 * `.claude/skills/dev-flow-e2e/SKILL.md` Schritt 8.5 ("headed-verify"):
 *
 *   cd tests/e2e/ && SKIP_DB_PURGE=1 WEBSITE_URL="$BASE_URL" \
 *     ./node_modules/.bin/playwright test specs/k8-headed-verify.spec.ts --headed --project website
 *
 * Der Agent parametrisiert VOR jedem Lauf die untenstehenden Konstanten (Ziel-URL, Pfad,
 * Selektor, erwarteter Text) passend zur gerade verifizierten Implementierung — das Spec
 * selbst bleibt ein Rahmen, kein starres Assertion-Set.
 */

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// Agent-parametrisierbare Test-Parameter (vor dem Lauf anpassen).
const VERIFY_TARGET = {
  path: process.env.K8_HEADED_PATH ?? '/',
  selector: process.env.K8_HEADED_SELECTOR ?? 'body',
  expectVisible: true,
};

// Vision-Endpunkt für die optionale screenshot-gestützte Verifikation. Kein neuer
// Dienst — der Weg führt über den bereits laufenden llm-proxy.
//
// [T012781] Vorher stand hier Port 8094 mit 8091 als Rückfall. Beides war
// wirkungslos: 8094 hat in scripts/llm/loadouts.json keinen Eintrag, und das
// Loadout auf 8091 (gemma26-factory) trägt in seinen eigenen notes den Satz
// "Kein mmproj". Weil dieser Aufruf Fehler nur als Annotation notiert, ist das
// seit T002467 nie aufgefallen — die Annotation lautete immer "nicht erreichbar".
//
// Nicht direkt auf 8089: der llama.cpp-Server läuft auf dem Windows-GPU-Host und
// ist aus WSL nicht erreichbar (curl -> HTTP-Code 000, Proxy -> 200).
const VISION_SERVER_URL = process.env.K8_VISION_URL ?? 'http://127.0.0.1:18235/v1/chat/completions';
const VISION_MODEL = process.env.K8_VISION_MODEL ?? 'gemma12-vision';

test.describe('K8: Agentische Headed-Verifikation (T002467, manuell/agentisch)', () => {
  test.beforeEach(() => {
    // Positiv-Anker + harte Bremse: dieser Block darf in keinem automatisierten
    // CI-Lauf tatsächlich Assertions ausführen. GitHub Actions setzt CI=true auf
    // allen Runnern (e2e.yml, e2e-pr.yml, ci.yml) — lokale/agentische Läufe setzen
    // es nicht.
    test.skip(!!process.env.CI, 'K8 headed-verify ist explizit kein CI-Pfad — nur manuell/agentisch (T002467, REQ-k8-02)');
  });

  test('headed-verify: Ziel-Element ist im echten Browser sichtbar', async ({ page }) => {
    await page.goto(`${BASE}${VERIFY_TARGET.path}`);
    const locator = page.locator(VERIFY_TARGET.selector).first();
    if (VERIFY_TARGET.expectVisible) {
      await expect(locator).toBeVisible();
    } else {
      await expect(locator).toBeHidden();
    }
  });

  test('headed-verify: optionaler Vision-Check (Screenshot → llm-proxy)', async ({ page }) => {
    await page.goto(`${BASE}${VERIFY_TARGET.path}`);
    const screenshot = await page.screenshot({ fullPage: false });

    // Best-effort: das Vision-Loadout läuft bereits (gemma12-vision, mmproj-F16).
    // Ist es nicht erreichbar, wird die Prüfung übersprungen, statt den Testlauf
    // zu blocken — diese Stufe informiert, sie gate't nicht.
    try {
      const res = await fetch(VISION_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Ohne 'model' trifft die Anfrage beim Proxy kein Backend.
          model: VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Beschreibe kurz, was auf diesem Screenshot sichtbar ist.' },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${screenshot.toString('base64')}` },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      // Status 404 heisst hier NICHT "kein Server", sondern "Proxy da, Alias
      // fehlt" — die Abhilfe ist die Backend-Migration, nicht ein Serverstart.
      // Werden beide Fehlbilder zu "nicht erreichbar" verschmolzen, wiederholt
      // sich genau der Vorfall, den T012781 behebt.
      test.info().annotations.push({
        type: res.ok ? 'vision-check' : 'vision-check-unavailable',
        description: res.ok
          ? `Vision-Modell ${VISION_MODEL} antwortete`
          : `llm-proxy antwortete mit Status ${res.status} — Modellalias ${VISION_MODEL} vermutlich `
            + 'nicht gefuehrt (scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql)',
      });
    } catch (err) {
      test.info().annotations.push({
        type: 'vision-check-skipped',
        description: `llm-proxy nicht erreichbar unter ${VISION_SERVER_URL} `
          + `(${(err as Error).message}) — non-fatal`,
      });
    }
  });
});
