// tests/e2e/specs/planungsbuero-klaerung.spec.ts
//
// Happy-Path: Admin öffnet das Planungsbüro, klappt eine Karte mit < 4/4 DoR auf,
// füllt die Klärungsfelder aus, speichert, und der DoR-Zähler der Karte steigt.

import { test, expect } from '@playwright/test';
import { ensureAdminPasswordOrSkip } from '../lib/systemtest-runner';

test.describe('Planungsbüro: Inline-Klärungsrunde', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(120_000);

  test('expand a card, answer clarification fields, save, DoR increases', async ({ page }) => {
    await page.goto('/admin/planungsbuero');

    await page.waitForSelector('[data-testid="office-root"]');

    const cards = page.locator('[data-testid="office-card"]');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'Kein planning-Ticket im Büro — nichts zu klären.');

    // Erste Karte mit DoR < 4/4 finden.
    let target = -1;
    for (let i = 0; i < cardCount; i++) {
      const dorText = (await cards.nth(i).locator('[data-testid="office-dor"]').innerText()).trim();
      const score = parseInt(dorText.split('/')[0], 10);
      if (score < 4) { target = i; break; }
    }
    test.skip(target === -1, 'Alle Karten sind bereits 4/4 — kein Klärungsbedarf.');

    const card = cards.nth(target);
    const dorBefore = parseInt((await card.locator('[data-testid="office-dor"]').innerText()).split('/')[0], 10);

    // Aufklappen.
    await card.locator('[data-testid="office-expand"]').click();
    const clarify = page.locator('[data-testid^="office-clarify-"]').first();
    await expect(clarify).toBeVisible();

    // Mindestens ein Feld je sichtbarer Section beantworten.
    const textInputs = clarify.locator('input[type="text"], textarea');
    const nText = await textInputs.count();
    for (let i = 0; i < nText; i++) await textInputs.nth(i).fill('Geklärt (E2E)');

    const radios = clarify.locator('input[type="radio"]');
    const nRadio = await radios.count();
    if (nRadio > 0) await radios.first().check();

    const checks = clarify.locator('input[type="checkbox"]');
    if (await checks.count() > 0) await checks.first().check();

    // Speichern.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/clarify') && r.request().method() === 'POST' && r.ok()),
      clarify.locator('[data-testid="office-clarify-save"]').click(),
    ]);

    // DoR ist gestiegen.
    await page.waitForTimeout(1000);
    const dorNow = parseInt((await card.locator('[data-testid="office-dor"]').innerText()).split('/')[0], 10);
    expect(dorNow).toBeGreaterThan(dorBefore);
  });
});
