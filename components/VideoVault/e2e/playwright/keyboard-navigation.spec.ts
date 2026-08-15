import { test, expect } from '@playwright/test';

/**
 * Keyboard Navigation Tests for VideoVault Application
 *
 * Tests keyboard accessibility for video management features,
 * including grid navigation, player controls, and bulk operations.
 *
 * Related: ACCESSIBILITY_ISSUES.md Issues #10, #11, #12, #13, #14
 */

test.describe('Keyboard Navigation - Video Grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for video grid to load
    await page.waitForSelector('.video-card, [data-testid="video-card"]', { timeout: 5000 });
  });

  test('should navigate video cards with Tab', async ({ page }) => {
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();

    // Tab to first video card
    let focused = false;
    for (let i = 0; i < 20 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await firstCard.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
    }

    expect(focused).toBe(true);
  });

  test('should open video with Enter key', async ({ page }) => {
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();

    // Tab to video card
    await firstCard.focus();

    // Press Enter
    await page.keyboard.press('Enter');

    // Video modal or detail page should open
    const modal = page.locator('[role="dialog"], .video-player-modal, .modal');
    await expect(modal).toBeVisible({ timeout: 3000 });
  });

  test('should navigate through video grid in logical order', async ({ page }) => {
    const cards = page.locator('.video-card, [data-testid="video-card"]');
    const cardCount = await cards.count();

    if (cardCount >= 3) {
      // Focus first card
      await cards.first().focus();
      const firstId = await cards.first().getAttribute('data-video-id');

      // Tab to next card
      await page.keyboard.press('Tab');
      const secondId = await page.evaluate(() => {
        return document.activeElement?.getAttribute('data-video-id');
      });

      // IDs should be different (moved to next card)
      expect(secondId).not.toBe(firstId);
    }
  });

  test('should have visible focus indicators on cards', async ({ page }) => {
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();
    await firstCard.focus();

    const outline = await firstCard.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        outlineWidth: styles.outlineWidth,
        borderColor: styles.borderColor
      };
    });

    // Should have visible focus indicator (outline or border change)
    const hasVisibleFocus = parseFloat(outline.outlineWidth) > 0 ||
                           outline.borderColor.includes('0, 242, 255'); // Cyan

    expect(hasVisibleFocus).toBe(true);
  });
});

test.describe('Keyboard Navigation - Video Player Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card, [data-testid="video-card"]');

    // Open first video
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();
    await firstCard.click();

    // Wait for player modal
    await page.waitForSelector('[role="dialog"], .video-player-modal, video');
  });

  test('should close modal with Escape key', async ({ page }) => {
    const modal = page.locator('[role="dialog"], .video-player-modal');
    await expect(modal).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 2000 });
  });

  test('should play/pause with Space key (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    const video = page.locator('video');

    // Focus the player surface (required for keyboard shortcuts)
    await playerSurface.focus();

    // Get initial play state
    const initialPaused = await video.evaluate((v: HTMLVideoElement) => v.paused);

    // Press Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Play state should toggle
    const newPaused = await video.evaluate((v: HTMLVideoElement) => v.paused);
    expect(newPaused).not.toBe(initialPaused);
  });

  test('should seek backward with Left Arrow (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    const video = page.locator('video');

    await playerSurface.focus();

    // Set a known time position
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 10; });
    await page.waitForTimeout(200);

    const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);

    // Press Left Arrow (should seek -5 seconds)
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);

    const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(newTime).toBeLessThan(initialTime);
  });

  test('should seek forward with Right Arrow (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    const video = page.locator('video');

    await playerSurface.focus();

    const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);

    // Press Right Arrow (should seek +5 seconds)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(newTime).toBeGreaterThan(initialTime);
  });

  test('should adjust volume with Up/Down Arrows (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    const video = page.locator('video');

    await playerSurface.focus();

    // Set initial volume to 0.5
    await video.evaluate((v: HTMLVideoElement) => { v.volume = 0.5; });
    await page.waitForTimeout(200);

    // Press Up Arrow (should increase by 10%)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);

    const newVolume = await video.evaluate((v: HTMLVideoElement) => v.volume);
    expect(newVolume).toBeCloseTo(0.6, 1);

    // Press Down Arrow (should decrease by 10%)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    const finalVolume = await video.evaluate((v: HTMLVideoElement) => v.volume);
    expect(finalVolume).toBeCloseTo(0.5, 1);
  });

  test('should toggle mute with M key (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    const video = page.locator('video');

    await playerSurface.focus();

    const initialMuted = await video.evaluate((v: HTMLVideoElement) => v.muted);

    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    const newMuted = await video.evaluate((v: HTMLVideoElement) => v.muted || v.volume === 0);
    expect(newMuted).not.toBe(initialMuted);
  });

  test('should toggle fullscreen with F key (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    await playerSurface.focus();

    await page.keyboard.press('f');
    await page.waitForTimeout(500);

    // Check if fullscreen API was called
    const isFullscreen = await page.evaluate(() => {
      return document.fullscreenElement !== null;
    });

    expect(isFullscreen).toBe(true);

    // Exit fullscreen
    await page.keyboard.press('Escape');
  });

  test('should seek to percentage with number keys 0-9 (Issue #10 - IMPLEMENTED)', async ({ page }) => {
    const playerSurface = page.locator('[data-testid="player-surface"]');
    const video = page.locator('video');

    await playerSurface.focus();

    // Get duration
    const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);

    // Press "5" for 50%
    await page.keyboard.press('5');
    await page.waitForTimeout(200);

    const currentTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    const expectedTime = duration * 0.5;

    // Should be approximately 50% (within 1 second)
    expect(Math.abs(currentTime - expectedTime)).toBeLessThan(1);
  });

  test('should trap focus within modal', async ({ page }) => {
    const modal = page.locator('[role="dialog"], .video-player-modal');

    // Tab through modal elements
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
    }

    // Focus should still be within modal
    const focusInModal = await modal.evaluate((el) => {
      return el.contains(document.activeElement);
    });

    expect(focusInModal).toBe(true);
  });
});

test.describe('Keyboard Navigation - Bulk Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card, [data-testid="video-card"]');
  });

  test('should toggle selection with Space key (Issue #11 - IMPLEMENTED)', async ({ page }) => {
    const firstCard = page.locator('[data-testid^="video-card-"]').first();
    const checkbox = firstCard.locator('[data-testid^="checkbox-select-"]');

    // Focus card
    await firstCard.focus();

    // First, enable selection mode by clicking checkbox or Ctrl+Click
    // We'll Ctrl+Click to select the first card
    await firstCard.click({ modifiers: ['Control'] });
    await page.waitForTimeout(300);

    // Now selection mode should be active and checkbox visible
    await expect(checkbox).toBeVisible();

    // Focus a second card
    const secondCard = page.locator('[data-testid^="video-card-"]').nth(1);
    await secondCard.focus();

    // Press Space to toggle selection on second card
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Second card should now be selected (checkbox checked)
    const secondCheckbox = secondCard.locator('[data-testid^="checkbox-select-"]');
    const isChecked = await secondCheckbox.evaluate((el: HTMLElement) => {
      return (el as HTMLInputElement).getAttribute('data-state') === 'checked';
    });

    expect(isChecked).toBe(true);

    // Press Space again to deselect
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    const isUnchecked = await secondCheckbox.evaluate((el: HTMLElement) => {
      return (el as HTMLInputElement).getAttribute('data-state') === 'unchecked';
    });

    expect(isUnchecked).toBe(true);
  });

  test.skip('should select all with Ctrl+A (Issue #11)', async ({ page }) => {
    const cards = page.locator('.video-card, [data-testid="video-card"]');
    const totalCards = await cards.count();

    // Press Ctrl+A
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(500);

    // All cards should be selected
    const selectedCount = await page.locator('.video-card.selected, [data-testid="video-card"][aria-checked="true"]').count();

    expect(selectedCount).toBe(totalCards);
  });

  test.skip('should show bulk actions bar when items selected', async ({ page }) => {
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();

    // Select card with Space
    await firstCard.focus();
    await page.keyboard.press('Space');

    // Bulk actions bar should appear
    const bulkBar = page.locator('.bulk-actions-bar, [data-testid="bulk-actions"]');
    await expect(bulkBar).toBeVisible({ timeout: 2000 });
  });

  test.skip('should navigate bulk actions with Tab (Issue #14)', async ({ page }) => {
    // Select a video
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();
    await firstCard.focus();
    await page.keyboard.press('Space');

    // Wait for bulk actions bar
    await page.waitForSelector('.bulk-actions-bar, [data-testid="bulk-actions"]');

    // Tab to bulk actions
    const addTagsButton = page.getByRole('button', { name: /add tags/i });

    let focused = false;
    for (let i = 0; i < 30 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await addTagsButton.evaluate((el) => el === document.activeElement);
    }

    expect(focused).toBe(true);
  });

  test.skip('should cancel bulk selection with Escape (Issue #14)', async ({ page }) => {
    // Select a video
    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();
    await firstCard.focus();
    await page.keyboard.press('Space');

    const bulkBar = page.locator('.bulk-actions-bar, [data-testid="bulk-actions"]');
    await expect(bulkBar).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Bulk actions should hide
    await expect(bulkBar).not.toBeVisible();

    // Selection should be cleared
    const selectedCards = page.locator('.video-card.selected, [aria-checked="true"]');
    expect(await selectedCards.count()).toBe(0);
  });
});

test.describe('Keyboard Navigation - Filter Controls', () => {
  test('should navigate filter inputs with Tab', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    const categoryFilter = page.locator('select, [role="combobox"]').first();

    // Tab to search
    if (await searchInput.isVisible()) {
      await searchInput.focus();
      await expect(searchInput).toBeFocused();

      // Tab to category filter
      await page.keyboard.press('Tab');
      // Next element should be focused (may not be category if layout different)
    }
  });

  test('should type in search field with keyboard', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.isVisible()) {
      await searchInput.focus();
      await page.keyboard.type('test video');

      await expect(searchInput).toHaveValue('test video');
    }
  });

  test.skip('should navigate dropdown with arrow keys (Issue #13)', async ({ page }) => {
    await page.goto('/');

    const categorySelect = page.locator('select[name*="category" i]').first();

    if (await categorySelect.isVisible()) {
      await categorySelect.focus();

      // Open dropdown (if custom)
      await page.keyboard.press('Space');

      // Navigate with arrows
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');

      // Select with Enter
      await page.keyboard.press('Enter');
    }
  });
});

test.describe('Keyboard Navigation - Virtualized Grid', () => {
  test.skip('should maintain focus when scrolling virtualized list (Issue #12)', async ({ page }) => {
    // This test requires a library with 100+ videos for virtualization
    await page.goto('/');

    // Scroll to trigger virtualization
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(500);

    // Focus a card
    const visibleCard = page.locator('.video-card:visible').first();
    await visibleCard.focus();

    const cardId = await visibleCard.getAttribute('data-video-id');

    // Scroll more
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(500);

    // Focus should be restored to nearest visible item or maintained
    const focusedId = await page.evaluate(() => {
      return document.activeElement?.getAttribute('data-video-id');
    });

    // Focus should either be maintained or restored intelligently
    expect(focusedId).toBeTruthy();
  });
});

test.describe('Keyboard Navigation - Settings & Forms', () => {
  test('should navigate settings forms with keyboard', async ({ page }) => {
    await page.goto('/settings');

    // Tab through form fields
    await page.keyboard.press('Tab');

    const firstInput = page.locator('input, select, textarea').first();
    if (await firstInput.isVisible()) {
      await expect(firstInput).toBeFocused();
    }
  });

  test('should submit forms with Enter key', async ({ page }) => {
    await page.goto('/settings');

    const submitButton = page.getByRole('button', { name: /save|submit|update/i });

    if (await submitButton.isVisible()) {
      await submitButton.focus();
      await page.keyboard.press('Enter');

      // Form should submit (check for success message or error)
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Accessibility - Focus Indicators', () => {
  test('All video cards should have visible focus', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card, [data-testid="video-card"]');

    const cards = page.locator('.video-card, [data-testid="video-card"]');
    const count = await cards.count();

    if (count > 0) {
      const firstCard = cards.first();
      await firstCard.focus();

      const hasOutline = await firstCard.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return parseFloat(styles.outlineWidth) > 0 ||
               styles.borderColor.includes('0, 242, 255'); // Cyan
      });

      expect(hasOutline).toBe(true);
    }
  });

  test('Focus indicator should use Cybervault cyan', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card, [data-testid="video-card"]');

    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();
    await firstCard.focus();

    const borderColor = await firstCard.evaluate((el) => {
      return window.getComputedStyle(el).borderColor;
    });

    // On focus, border should change to cyan
    // May need to trigger hover state as well
    expect(borderColor).toMatch(/0,\s*242,\s*255|#00f2ff/i);
  });
});

test.describe('Accessibility - Reduced Motion', () => {
  test('Card animations should respect reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const firstCard = page.locator('.video-card, [data-testid="video-card"]').first();

    const transitionDuration = await firstCard.evaluate((el) => {
      return window.getComputedStyle(el).transitionDuration;
    });

    // Should be minimal
    expect(parseFloat(transitionDuration)).toBeLessThan(0.1);
  });
});
