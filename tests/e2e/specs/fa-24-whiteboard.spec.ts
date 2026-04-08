import { test, expect } from '@playwright/test';

const BOARD_URL = process.env.BOARD_URL || 'http://board.localhost';

test.describe('FA-24: Kollaboratives Whiteboard', () => {

  test('T1: Whiteboard service responds', async ({ page }) => {
    const res = await page.goto(BOARD_URL);
    // Whiteboard may redirect or return 200 depending on auth
    expect(res?.status()).toBeLessThan(500);
  });

  test('T2: Whiteboard is not returning server error', async ({ page }) => {
    const res = await page.goto(BOARD_URL);
    expect(res?.status()).not.toBe(502);
    expect(res?.status()).not.toBe(503);
  });
});
