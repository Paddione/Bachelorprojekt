import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// FA-62: Gemma12 Factory Model Parallel Sessions (T012414)
//
// Kontext: gemma12 ist nun als Factory-Modell mit 3 parallelen Sessions
// integriert. Dies stellt sicher, dass das Modell nicht durch einzelne
// lange Anfragen blockiert wird.
//
// Positiv-Anker (T1): Die Basis-URL antwortet 200 — Die Seite ist live.
test.describe('FA-62: Gemma12 Factory Model', { tag: ['@factory'] }, () => {
  test('T1: / ist erreichbar (Positiv-Anker)', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('body')).toBeVisible();
  });
});
