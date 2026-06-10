import { test, expect } from '@playwright/test';

// Kommissionierung-Spalte auf /dev-status (admin-gated, läuft im mentolder-Projekt
// mit gespeichertem Admin-Auth-State). Read-only Render + „-> Factory"-Knopf.
test.describe('Kommissionierung (Factory-Floor)', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/dev-status'); });

  test('rendert die Kommissionierungs-Spalte und die Leitstand-Kachel', async ({ page }) => {
    await expect(page.getByTestId('floor-kommissionierung')).toBeVisible();
    await expect(page.getByTestId('floor-kommissionierung')).toContainText('Kommissionierung');
    await expect(page.getByTestId('floor-komm-count')).toBeVisible();
  });

  test('zeigt entweder gestagte Items oder den Leer-Zustand', async ({ page }) => {
    const col = page.getByTestId('floor-kommissionierung');
    const items = col.getByTestId('floor-staged-item');
    const count = await items.count();
    if (count === 0) {
      await expect(col).toContainText('Nichts kommissioniert.');
    } else {
      // Jedes Item hat die zwei Aktionsknöpfe.
      await expect(items.first().getByTestId('floor-staged-release')).toBeVisible();
      await expect(items.first().getByTestId('floor-staged-manual')).toBeVisible();
    }
  });

  test('„-> Manuell" blendet den dev-flow-execute-Hinweis ein', async ({ page }) => {
    const items = page.getByTestId('floor-kommissionierung').getByTestId('floor-staged-item');
    test.skip(await items.count() === 0, 'kein gestagtes Item vorhanden');
    await items.first().getByTestId('floor-staged-manual').click();
    await expect(items.first().getByTestId('floor-staged-manual-hint')).toContainText('dev-flow-execute');
  });

  test('„-> Factory" entfernt das Item aus der Kommissionierung', async ({ page }) => {
    const col = page.getByTestId('floor-kommissionierung');
    const items = col.getByTestId('floor-staged-item');
    test.skip(await items.count() === 0, 'kein gestagtes Item vorhanden');
    const firstExtId = await items.first().getByRole('link').first().innerText();
    await items.first().getByTestId('floor-staged-release').click();
    // Nach Freigabe verschwindet das Item (optimistisch + 4s-Poll); auf Verschwinden warten.
    await expect.poll(async () =>
      (await col.getByTestId('floor-staged-item').allInnerTexts()).join(' ')
    ).not.toContain(firstExtId);
  });
});
