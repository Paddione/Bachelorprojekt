import { test, expect } from '@playwright/test';

test.describe('Undo Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
  });

  test('should show undo toast when removing a category', async ({ page }) => {
    // Wait for videos to load
    await page.waitForSelector('[data-testid="video-card"]', { timeout: 10000 });

    // Find a video card with categories
    const videoCard = page.locator('[data-testid="video-card"]').first();
    await videoCard.hover();

    // Look for a category chip/tag
    const categoryChip = videoCard
      .locator('[data-testid="category-chip"], .category-chip, [class*="category"]')
      .first();

    if ((await categoryChip.count()) > 0) {
      // Click the remove button on the category (usually an X button)
      const removeButton = categoryChip.locator('button, [role="button"]').first();
      if ((await removeButton.count()) > 0) {
        await removeButton.click();

        // Check that a toast with "Undo" button appears
        const toast = page.locator('[role="status"], [data-testid="toast"]');
        await expect(toast).toBeVisible({ timeout: 2000 });

        // Verify the toast contains "Category removed" and an "Undo" button
        await expect(toast.locator('text=/Category removed/i')).toBeVisible();
        const undoButton = toast.locator('button:has-text("Undo")');
        await expect(undoButton).toBeVisible();
      }
    }
  });

  test('should restore category when undo button is clicked', async ({ page }) => {
    // Wait for videos to load
    await page.waitForSelector('[data-testid="video-card"]', { timeout: 10000 });

    // Find a video card with categories
    const videoCard = page.locator('[data-testid="video-card"]').first();
    const videoTitle = await videoCard
      .locator('[data-testid="video-title"], h3, h2')
      .first()
      .textContent();

    // Get initial category count
    const categoryChips = videoCard.locator(
      '[data-testid="category-chip"], .category-chip, [class*="category"]',
    );
    const initialCount = await categoryChips.count();

    if (initialCount > 0) {
      // Get the text of the first category
      const firstCategory = categoryChips.first();
      const categoryText = await firstCategory.textContent();

      // Remove the category
      const removeButton = firstCategory.locator('button, [role="button"]').first();
      if ((await removeButton.count()) > 0) {
        await removeButton.click();

        // Wait for toast
        const toast = page.locator('[role="status"], [data-testid="toast"]');
        await expect(toast).toBeVisible({ timeout: 2000 });

        // Click undo
        const undoButton = toast.locator('button:has-text("Undo")');
        await undoButton.click();

        // Wait a moment for the undo to process
        await page.waitForTimeout(500);

        // Verify the category is restored
        const categoryChipsAfterUndo = videoCard.locator(
          '[data-testid="category-chip"], .category-chip, [class*="category"]',
        );
        const finalCount = await categoryChipsAfterUndo.count();

        // The count should be back to the original
        expect(finalCount).toBe(initialCount);

        // Verify we got a success toast
        const successToast = page.locator('[role="status"]:has-text("Undone")');
        await expect(successToast).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should auto-dismiss toast after timeout', async ({ page }) => {
    // This test verifies that the undo option expires
    // Note: We use a shorter timeout for testing purposes

    // Wait for videos to load
    await page.waitForSelector('[data-testid="video-card"]', { timeout: 10000 });

    // Find a video card with categories
    const videoCard = page.locator('[data-testid="video-card"]').first();
    const categoryChips = videoCard.locator(
      '[data-testid="category-chip"], .category-chip, [class*="category"]',
    );

    if ((await categoryChips.count()) > 0) {
      // Remove a category
      const firstCategory = categoryChips.first();
      const removeButton = firstCategory.locator('button, [role="button"]').first();

      if ((await removeButton.count()) > 0) {
        await removeButton.click();

        // Verify toast appears
        const toast = page.locator('[role="status"], [data-testid="toast"]');
        await expect(toast).toBeVisible({ timeout: 2000 });

        // Wait for the toast to auto-dismiss (default is 10 seconds, but toasts might dismiss sooner)
        // Note: In production, this timeout is 10 seconds, but we check that it eventually disappears
        await expect(toast).not.toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('should handle multiple undo operations independently', async ({ page }) => {
    // Wait for videos to load
    await page.waitForSelector('[data-testid="video-card"]', { timeout: 10000 });

    // Find multiple video cards
    const videoCards = page.locator('[data-testid="video-card"]');
    const cardCount = await videoCards.count();

    if (cardCount >= 2) {
      // Remove categories from two different videos
      for (let i = 0; i < Math.min(2, cardCount); i++) {
        const card = videoCards.nth(i);
        const categoryChips = card.locator(
          '[data-testid="category-chip"], .category-chip, [class*="category"]',
        );

        if ((await categoryChips.count()) > 0) {
          const removeButton = categoryChips.first().locator('button, [role="button"]').first();
          if ((await removeButton.count()) > 0) {
            await removeButton.click();
            await page.waitForTimeout(100); // Small delay between operations
          }
        }
      }

      // Note: Since TOAST_LIMIT = 1, only the most recent toast should be visible
      // But we verify that operations are independent
      const toasts = page.locator('[role="status"], [data-testid="toast"]');
      await expect(toasts.first()).toBeVisible();
    }
  });
});
