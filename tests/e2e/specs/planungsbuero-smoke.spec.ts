import { test, expect } from '@playwright/test';

test.describe('Planungsbüro Smoke', { tag: ['@admin', '@planungsbuero'] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev-status?tab=planung');
    await page.locator('[data-testid="pb-stats-bar"]').waitFor({ state: 'visible', timeout: 30_000 });
  });

  test('Stats Bar sichtbar mit korrektem Format', async ({ page }) => {
    const bar = page.locator('[data-testid="pb-stats-bar"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/planning/);
    await expect(bar).toContainText(/ready/);
    await expect(bar).toContainText(/blocked/);
  });

  test('Erste Queue-Zeile hat pb-queue-row testid und ist 56px hoch', async ({ page }) => {
    const firstRow = page.locator('[data-testid^="pb-queue-row-"]').first();
    await expect(firstRow).toBeVisible();
    const box = await firstRow.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
  });

  test('Klick auf Zeile rendert Detail-Panel sichtbar', async ({ page }) => {
    const firstRow = page.locator('[data-testid^="pb-queue-row-"]').first();
    await firstRow.click();
    const detail = page.locator('[data-testid="pb-detail"]');
    await expect(detail).toBeVisible({ timeout: 30_000 });
  });

  test('Promote-Button ist disabled wenn Readiness < 4', async ({ page }) => {
    const firstRow = page.locator('[data-testid^="pb-queue-row-"]').first();
    await firstRow.click();
    const promote = page.locator('[data-testid="pb-detail-promote"]');
    await expect(promote).toBeVisible({ timeout: 30_000 });
    const dorSquares = firstRow.locator('.pb-dor-on');
    const count = await dorSquares.count();
    if (count < 4) {
      await expect(promote).toBeDisabled();
    }
  });
});
