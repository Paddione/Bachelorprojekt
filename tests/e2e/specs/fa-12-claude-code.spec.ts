import { test, expect } from '@playwright/test';

const MCP_STATUS_URL = process.env.MCP_STATUS_URL || 'http://ai.localhost';

test.describe('FA-12: Claude Code AI Assistant', () => {

  test('T1: MCP status page loads', async ({ page }) => {
    const res = await page.goto(MCP_STATUS_URL);
    expect(res?.status()).toBe(200);
  });

  test('T2: Status page shows server grid', async ({ page }) => {
    await page.goto(MCP_STATUS_URL);
    await expect(page.locator('#cluster-grid')).toBeVisible();
    await expect(page.locator('#business-grid')).toBeVisible();
  });

  test('T3: Status page shows MCP server cards', async ({ page }) => {
    await page.goto(MCP_STATUS_URL);
    // Wait for health.json to load and render cards
    await page.waitForTimeout(2000);
    const cards = page.locator('.card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('T4: Status page title is correct', async ({ page }) => {
    await page.goto(MCP_STATUS_URL);
    await expect(page.locator('#title')).toContainText('MCP Server Status');
  });
});
