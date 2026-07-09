import { test, expect, chromium } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett share link (T000608)', () => {
  test.skip(!BRETT_OIDC_SECRET, 'BRETT_OIDC_SECRET required');

  test('leader creates a share link; guest views the board read-only', async ({ page }) => {
    const room = `e2e-share-${Math.random().toString(36).slice(2, 8)}`;

    await page.goto(`${BRETT_URL}?room=${room}`);
    await page.waitForFunction(() => {
      const ws = (window as any).__brettWS;
      return ws && ws.readyState === 1;
    }, { timeout: 15000 });

    await page.evaluate(() => (window as any).__brettWS.send(JSON.stringify({ type: 'admin_session_create' })));
    await page.waitForTimeout(500);

    const shareBtn = page.locator('#share-btn');
    await expect(shareBtn).toBeVisible({ timeout: 30_000 });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await shareBtn.click();
    await expect(page.getByText('Link in Zwischenablage kopiert!')).toBeVisible({ timeout: 30_000 });
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toContain('/share/');

    const browser = await chromium.launch();
    const guestCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const guest = await guestCtx.newPage();
    await guest.goto(shareUrl);

    await expect(guest.locator('#view-only-badge')).toBeVisible({ timeout: 30_000 });
    await expect(guest.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect(guest.locator('#fig-panel-btn')).toHaveCount(0);

    await guestCtx.close();
    await browser.close();
  });

  test('a disabled / invalid link shows an error', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const guest = await ctx.newPage();
    await guest.goto(`${BRETT_URL}/share/this-token-does-not-exist`);
    await expect(guest.getByText(/ungültig|nicht mehr gültig/i)).toBeVisible();
    await ctx.close();
  });
});
