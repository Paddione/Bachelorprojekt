import { test, expect } from '@playwright/test';

test.describe('Planungsbüro', { tag: ['@admin', '@planungsbuero'] }, () => {
  test.beforeEach(async ({ page }) => { await page.goto('/admin/pipeline?tab=planung', { waitUntil: 'domcontentloaded' }); });

  test('legt eine Idee an und zeigt sie in der Liste', async ({ page }) => {
    await page.getByTestId('office-add-title').fill('E2E Testidee');
    await page.getByTestId('office-add-effort').selectOption('klein');
    await page.getByTestId('office-add-form').getByRole('button').click();
    await expect(page.getByTestId('office-list')).toContainText('E2E Testidee');
  });

  test('DoR-Toggle erhöht den Score und gibt Promote frei', async ({ page }) => {
    await page.getByTestId('office-card').first().click();
    const promote = page.getByTestId('office-promote');
    await expect(promote).toBeDisabled();
    for (const k of ['spec_skizziert','offene_fragen_geklaert','abhaengigkeiten_klar','aufwand_geschaetzt'])
      await page.getByTestId(`office-dor-${k}`).check();
    await expect(promote).toBeEnabled();
  });

  test('Rang ▲▼ ändert die Reihenfolge', async ({ page }) => {
    const before = await page.getByTestId('office-card').allInnerTexts();
    await page.getByTestId('office-card').nth(1).getByTestId('office-rank-up').click();
    await expect.poll(async () => (await page.getByTestId('office-card').allInnerTexts())[0])
      .not.toBe(before[0]);
  });
});
