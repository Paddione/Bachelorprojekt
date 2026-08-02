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

// Vision-Server für optionale screenshot-gestützte Verifikation (bereits laufend, kein
// neuer Dienst — siehe Design "KEIN neuer Server").
const VISION_SERVER_URL = process.env.K8_VISION_URL ?? 'http://localhost:8094/v1/chat/completions';

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

  test('headed-verify: optionaler Vision-Server-Check (Screenshot → Port 8094)', async ({ page }) => {
    await page.goto(`${BASE}${VERIFY_TARGET.path}`);
    const screenshot = await page.screenshot({ fullPage: false });

    // Best-effort: der Vision-Server ist ein separater, bereits laufender Dienst
    // (mmproj auf Port 8094). Ist er nicht erreichbar, wird die Vision-Prüfung
    // übersprungen, statt den Testlauf zu blocken — diese Stufe informiert, sie
    // gate't nicht (Design "Kein Abbruch bei Fehler").
    try {
      const res = await fetch(VISION_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      test.info().annotations.push({
        type: 'vision-check',
        description: res.ok ? 'Vision-Server antwortete' : `Vision-Server Status ${res.status}`,
      });
    } catch (err) {
      test.info().annotations.push({
        type: 'vision-check-skipped',
        description: `Vision-Server nicht erreichbar (${(err as Error).message}) — non-fatal`,
      });
    }
  });
});
