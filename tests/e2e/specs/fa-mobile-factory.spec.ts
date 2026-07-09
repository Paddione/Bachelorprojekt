import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

test.describe('FA-MOBILE: Factory Floor mobile parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/pipeline?tab=factory', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="factory-floor"]', { timeout: 45_000 });
  });

  test('FA-MOBILE-01: DetailPanel opens as Bottom-Sheet with backdrop and 44px close button', async ({ page }) => {
    const workpiece = page.locator('[data-testid="floor-staged-item"]').first();
    const hasStagedItem = await workpiece.count();
    if (hasStagedItem === 0) {
      test.skip(true, 'No staged items available — skipping DetailPanel test');
      return;
    }

    await workpiece.locator('button').first().click();
    const panel = page.locator('[data-testid="floor-detail"]');
    await expect(panel).toBeVisible({ timeout: 60_000 });

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeGreaterThan(700);
    }

    const backdrop = page.locator('.detail-panel__backdrop');
    await expect(backdrop).toBeVisible();

    const closeBtn = panel.locator('.detail-panel__close');
    const closeBtnBox = await closeBtn.boundingBox();
    expect(closeBtnBox).not.toBeNull();
    if (closeBtnBox) {
      expect(closeBtnBox.width).toBeGreaterThanOrEqual(44);
      expect(closeBtnBox.height).toBeGreaterThanOrEqual(44);
    }

    await backdrop.click();
    await expect(panel).not.toBeVisible({ timeout: 60_000 });
  });

  test('FA-MOBILE-02: Content padding — last Laderampe item not obscured by TabBar', async ({ page }) => {
    const tabs = page.locator('.mobile-tab-bar__tab');
    await tabs.nth(1).click();

    const loadingDock = page.locator('[data-testid="floor-loadingdock"]');
    await expect(loadingDock).toBeVisible({ timeout: 60_000 });

    const items = loadingDock.locator('li');
    const count = await items.count();
    if (count === 0) {
      const dockBox = await loadingDock.boundingBox();
      expect(dockBox).not.toBeNull();
      return;
    }

    const lastItem = items.last();
    const lastBox = await lastItem.boundingBox();
    const tabBar = page.locator('.mobile-tab-bar');
    const tabBarBox = await tabBar.boundingBox();

    expect(lastBox).not.toBeNull();
    expect(tabBarBox).not.toBeNull();

    if (lastBox && tabBarBox) {
      const lastItemBottom = lastBox.y + lastBox.height;
      expect(lastItemBottom).toBeLessThanOrEqual(tabBarBox.y + 4);
    }
  });

  test('FA-MOBILE-03: AdminTabs outer tabs all reachable via horizontal scroll (6 tabs)', async ({ page }) => {
    const tabBarWrap = page.locator('.tabs');
    await expect(tabBarWrap).toBeVisible();

    const tabs = page.locator('.tabs__tab');
    await expect(tabs).toHaveCount(6);

    await tabBarWrap.evaluate((el) => { el.scrollLeft = el.scrollWidth; });

    const lastTab = tabs.last();
    await expect(lastTab).toBeInViewport({ ratio: 0.5 });

    for (let i = 0; i < 5; i++) {
      await tabs.nth(i).scrollIntoViewIfNeeded();
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveClass(/active/);
    }
  });

  test('FA-MOBILE-04: Dot indicators update on MobileTabBar tap', async ({ page }) => {
    const dots = page.locator('.mobile-station-dots .dot');
    await expect(dots).toHaveCount(10);

    await expect(dots.first()).toHaveClass(/active/);

    const tabs = page.locator('.mobile-tab-bar__tab');
    await tabs.nth(2).click();

    await expect(dots.nth(2)).toHaveClass(/active/);
    await expect(dots.first()).not.toHaveClass(/active/);
  });

  test('FA-MOBILE-05: All 10 stations reachable via MobileTabBar', async ({ page }) => {
    const tabs = page.locator('.mobile-tab-bar__tab');
    await expect(tabs).toHaveCount(10);

    const COL_MAP: Record<number, string> = {
      0: 'staged',
      1: 'backlog',
      8: 'qs',
      9: 'done',
    };

    for (let i = 0; i < 10; i++) {
      await tabs.nth(i).scrollIntoViewIfNeeded();
      await tabs.nth(i).click();

      if (COL_MAP[i]) {
        const col = page.locator(`[data-col="${COL_MAP[i]}"]`);
        await expect(col).toHaveClass(/mobile-visible/, { timeout: 2_000 });
      }
    }
  });

  test('FA-MOBILE-06: Leitstand grid — all 8 cards visible without horizontal scroll', async ({ page }) => {
    const leitstand = page.locator('[data-testid="floor-leitstand"]');
    await expect(leitstand).toBeVisible();

    const overflow = await leitstand.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflow).toBe(false);

    const knownTestIds = ['floor-slots', 'floor-office', 'floor-komm-count'];
    for (const testId of knownTestIds) {
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    }

    const cards = leitstand.locator('> *');
    await expect(cards).toHaveCount(8);
  });
});
