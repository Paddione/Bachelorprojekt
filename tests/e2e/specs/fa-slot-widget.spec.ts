import { test, expect } from '@playwright/test';

test.describe('Slot Widget', () => {
  test('T1 – homepage shows next available day section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="slot-widget"]')).toBeVisible();
    await expect(page.locator('[data-testid="slot-widget-heading"]')).toContainText('Nächster freier Termin');
  });

  test('T2 – slot pills link to /termin with params', async ({ page }) => {
    await page.goto('/');
    const firstPill = page.locator('[data-testid="slot-pill"]').first();
    await expect(firstPill).toBeVisible();
    const href = await firstPill.getAttribute('href');
    expect(href).toMatch(/\/termin\?date=\d{4}-\d{2}-\d{2}&start=\d{2}:\d{2}&end=\d{2}:\d{2}/);
  });

  test('T3 – clicking slot pill pre-fills booking form', async ({ page }) => {
    await page.goto('/');
    const firstPill = page.locator('[data-testid="slot-pill"]').first();
    await expect(firstPill).toBeVisible();
    const href = await firstPill.getAttribute('href');
    expect(href).not.toBeNull();
    await page.goto(href!);
    // BookingForm should show the pre-selected slot highlighted
    await expect(page.locator('[data-testid="selected-slot-display"]')).toBeVisible();
  });
});
