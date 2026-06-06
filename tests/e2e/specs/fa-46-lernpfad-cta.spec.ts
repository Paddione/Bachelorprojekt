/**
 * FA-46 — Lernpfad CTA durchspielbar.
 * Klick auf „weiter lernen →" auf /portal/loslernen öffnet den Sidekick auf der
 * Agent-Anleitung und scrollt/expandiert genau die zugehörige Karte (ag-<type>-<id>).
 * /portal/arena?jumpTo= wird NICHT mehr verlinkt.
 *
 * Runs in the authenticated `mentolder` project (storageState). Skips gracefully
 * when the session is empty (E2E_ADMIN_PASS absent → no auth cookie).
 */
import { test, expect } from '@playwright/test';

test.describe('FA-46 Lernpfad CTA', () => {
  test('weiter-lernen öffnet den Sidekick und expandiert die passende Karte', async ({ page }) => {
    const resp = await page.goto('/portal/loslernen');
    // If unauthenticated, the portal redirects to login → skip (no seeded session).
    if (!page.url().includes('/portal/loslernen')) {
      test.skip(true, 'no authenticated session (E2E_ADMIN_PASS not set)');
      return;
    }
    expect(resp?.status()).toBeLessThan(400);

    // The dead arena deep-link must be gone.
    await expect(page.locator('a[href*="/portal/arena?jumpTo="]')).toHaveCount(0);

    // Grab the first CTA + its target domId.
    const cta = page.locator('[data-testid="weiter-lernen"]').first();
    await expect(cta).toBeVisible();
    const domId = await cta.getAttribute('data-jump-domid');
    expect(domId).toBeTruthy();

    // Click → Sidekick opens on the Agent-Anleitung, the matching card expands + scrolls.
    await cta.click();
    await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung', { timeout: 5_000 });
    const target = page.locator(`#${domId}`);
    await expect(target).toBeInViewport({ timeout: 5_000 });
    await expect(target.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'true');
  });

  test('Banner führt in die Agent-Anleitung', async ({ page }) => {
    await page.goto('/portal/loslernen');
    if (!page.url().includes('/portal/loslernen')) {
      test.skip(true, 'no authenticated session');
      return;
    }
    // Open the Sidekick via its FAB; the home banner (start/continue) routes to agent-guide.
    await page.locator('.fab').click();
    const banner = page.locator('.sk-banner');
    if (await banner.count()) {
      if (await banner.evaluate((el) => el.tagName === 'BUTTON')) {
        await banner.click();
        await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung', { timeout: 5_000 });
      }
    }
  });
});
