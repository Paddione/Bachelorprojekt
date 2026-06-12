import { test, expect } from '@playwright/test';

test.describe('Kundenprofil — Portal Self-Service', () => {
  test('Kunde sieht Profil-Karte und Bearbeiten-Button', async ({ page }) => {
    await page.goto('/portal?section=konto');
    await expect(page.getByText('Meine Kontaktdaten')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Profil bearbeiten' })).toBeVisible();
  });

  test('Kunde kann Telefon + Firma editieren und speichern', async ({ page }) => {
    await page.goto('/portal?section=konto');
    await page.getByRole('button', { name: 'Profil bearbeiten' }).click();
    const editor = page.getByTestId('profile-editor');
    await editor.getByLabel('Telefon').fill('+49 30 9999999');
    await editor.getByLabel('Firma').fill('Testfirma GmbH');
    await editor.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Profil gespeichert.')).toBeVisible();
  });
});
