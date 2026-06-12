import { test, expect } from '@playwright/test';

const CLIENT_ID = process.env.E2E_TEST_CLIENT_ID ?? '';

test.describe('Kundenprofil — Admin CRM', () => {
  test.skip(!CLIENT_ID, 'E2E_TEST_CLIENT_ID nicht gesetzt');

  test('Admin sieht den Profil-Tab', async ({ page }) => {
    await page.goto(`/admin/${CLIENT_ID}?tab=profil`);
    await expect(page.getByTestId('admin-client-profil')).toBeVisible();
    await expect(page.getByText('CRM-Status')).toBeVisible();
  });

  test('Admin kann einen Kontakthistorie-Eintrag hinzufügen', async ({ page }) => {
    await page.goto(`/admin/${CLIENT_ID}?tab=profil`);
    await page.getByPlaceholder('Betreff').fill('E2E Erstkontakt');
    await page.getByRole('button', { name: '+ Eintrag' }).click();
    await expect(page.getByText('E2E Erstkontakt')).toBeVisible();
  });

  test('Admin kann den CRM-Status ändern', async ({ page }) => {
    await page.goto(`/admin/${CLIENT_ID}?tab=profil`);
    const panel = page.getByText('CRM-Status').locator('..');
    await panel.getByRole('combobox').first().selectOption('pausiert');
    await panel.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();
  });
});
