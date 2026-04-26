import { test, expect } from '@playwright/test';

// SlotWidget is conditionally rendered on the homepage only when CalDAV reports
// available slots. When no slots exist, a "Termine ansehen →" placeholder renders.

test.describe('Slot Widget', () => {
  test('T1 – homepage shows slot widget or availability placeholder', async ({ page }) => {
    await page.goto('/');
    // Either the slot widget (when slots available) or the fallback link is shown
    const widget = page.locator('[data-testid="slot-widget"]');
    const placeholder = page.locator('a[href="/termin"]');
    await expect(widget.or(placeholder).first()).toBeVisible({ timeout: 10_000 });
  });

  test('T2 – slot pills link to /termin with params (skipped if no slots)', async ({ page }) => {
    await page.goto('/');
    const firstPill = page.locator('[data-testid="slot-pill"]').first();
    const hasSlots = await firstPill.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasSlots) {
      test.skip(true, 'No available slots — slot widget not rendered');
      return;
    }
    const href = await firstPill.getAttribute('href');
    expect(href).toMatch(/\/termin\?date=\d{4}-\d{2}-\d{2}&start=\d{2}:\d{2}&end=\d{2}:\d{2}/);
  });

  test('T3 – clicking slot pill pre-fills booking form (skipped if no slots)', async ({ page }) => {
    await page.goto('/');
    const firstPill = page.locator('[data-testid="slot-pill"]').first();
    const hasSlots = await firstPill.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasSlots) {
      test.skip(true, 'No available slots — slot widget not rendered');
      return;
    }
    const href = await firstPill.getAttribute('href');
    expect(href).not.toBeNull();
    await page.goto(href!);
    await expect(page.locator('[data-testid="selected-slot-display"]')).toBeVisible();
  });
});
