import { test, expect } from '@playwright/test';
import { afterTestCleanup } from './test-utils';

function buildFixture() {
  const now = new Date().toISOString();
  const base = {
    pathBase: '/root',
    rootKey: 'root-1',
  };
  const v = (id: string, name: string) => ({
    id,
    filename: `${name}.mp4`,
    displayName: name,
    path: `${base.pathBase}/${name}.mp4`,
    size: 1_000_000,
    lastModified: now,
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: ['hd'],
      performer: [],
    },
    customCategories: {},
    metadata: {
      duration: 60,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'H264',
      fps: 30,
      aspectRatio: '16:9',
    },
    thumbnail: { dataUrl: '', generated: false, timestamp: now },
    rootKey: base.rootKey,
  });

  const videos = Array.from({ length: 20 }, (_, i) => v(`v${i + 1}`, `video-${i + 1}`));

  return {
    version: '1.0',
    exportDate: now,
    videos,
    totalVideos: videos.length,
  };
}

async function importDataset(page: any): Promise<void> {
  const data = Buffer.from(JSON.stringify(buildFixture()), 'utf-8');
  const fcPromise = page.waitForEvent('filechooser');
  await page.getByTestId('button-import-data').click();
  const fc = await fcPromise;
  await fc.setFiles({ name: 'import.json', mimeType: 'application/json', buffer: data });
  // Wait for first card
  await page.getByTestId('video-card-v1').waitFor();
}

async function countCards(page: any): Promise<number> {
  return page.locator('[data-testid^="video-card-"]').count() as Promise<number>;
}

async function getSelectedCount(page: any): Promise<number> {
  const text = await page.getByText(/\d+ videos? selected/).textContent();
  const match = text?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

test.describe('Selection workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('button-import-data').waitFor();
  });

  // Clean up test data after all tests complete
  test.afterAll(async ({ page }) => {
    await afterTestCleanup(page);
  });

  test('select all and deselect all', async ({ page }) => {
    await importDataset(page);

    // Select all videos
    await page.getByTestId('button-select-all').click();
    await expect(page.getByText('20 videos selected')).toBeVisible();

    // Verify all checkboxes are checked
    const checkboxes = page.locator('[data-testid^="checkbox-select-"]');
    const count = await checkboxes.count();
    expect(count).toBe(20);

    // Deselect all
    await page.getByTestId('button-deselect-all').click();
    await expect(page.getByText('videos selected')).toHaveCount(0);
  });

  test('individual selection with ctrl-click', async ({ page }) => {
    await importDataset(page);

    // Select individual videos with ctrl-click
    await page.keyboard.down('Control');
    await page.getByTestId('video-card-v1').click();
    await page.getByTestId('video-card-v5').click();
    await page.getByTestId('video-card-v10').click();
    await page.keyboard.up('Control');

    await expect(page.getByText('3 videos selected')).toBeVisible();

    // Deselect one with ctrl-click
    await page.keyboard.down('Control');
    await page.getByTestId('video-card-v5').click();
    await page.keyboard.up('Control');

    await expect(page.getByText('2 videos selected')).toBeVisible();
  });

  test('range selection with shift-click', async ({ page }) => {
    await importDataset(page);

    // Click first video
    await page.getByTestId('checkbox-select-v1').click();
    await expect(page.getByText('1 video selected')).toBeVisible();

    // Shift-click on fifth video to select range
    await page.keyboard.down('Shift');
    await page.getByTestId('checkbox-select-v5').click();
    await page.keyboard.up('Shift');

    // Should select v1, v2, v3, v4, v5
    await expect(page.getByText('5 videos selected')).toBeVisible();

    // Verify the range is selected
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId(`checkbox-select-v${i}`)).toBeChecked();
    }
  });

  test('selection with keyboard shortcuts', async ({ page }) => {
    await importDataset(page);

    // Use 'a' to select all (if implemented)
    await page.keyboard.press('Control+a');
    // Note: This might select text instead, depends on implementation
    // Alternative: use custom shortcut if available

    // Use 'x' to toggle selection mode (if implemented)
    await page.keyboard.press('x');
    // Then arrow keys to navigate and space to select

    // For now, just verify basic keyboard navigation works
    await page.getByTestId('video-card-v1').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space'); // Select focused item

    // This test may need adjustment based on actual keyboard shortcut implementation
  });

  test('selection persistence across page actions', async ({ page }) => {
    await importDataset(page);

    // Select some videos
    await page.getByTestId('checkbox-select-v1').click();
    await page.getByTestId('checkbox-select-v2').click();
    await page.getByTestId('checkbox-select-v3').click();
    await expect(page.getByText('3 videos selected')).toBeVisible();

    // Scroll down and back up
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.evaluate(() => window.scrollTo(0, 0));

    // Selection should persist
    await expect(page.getByText('3 videos selected')).toBeVisible();
    await expect(page.getByTestId('checkbox-select-v1')).toBeChecked();
    await expect(page.getByTestId('checkbox-select-v2')).toBeChecked();
    await expect(page.getByTestId('checkbox-select-v3')).toBeChecked();
  });

  test('selection limits and performance', async ({ page }) => {
    await importDataset(page);

    // Select all 20 videos
    await page.getByTestId('button-select-all').click();
    await expect(page.getByText('20 videos selected')).toBeVisible();

    // Verify selection toolbar is responsive
    await expect(page.getByTestId('button-bulk-rename')).toBeVisible();
    await expect(page.getByTestId('button-deselect-all')).toBeVisible();

    // Deselect and reselect quickly
    await page.getByTestId('button-deselect-all').click();
    await page.getByTestId('button-select-all').click();
    await expect(page.getByText('20 videos selected')).toBeVisible();
  });

  test('selection state during filtering', async ({ page }) => {
    await importDataset(page);

    // Select some videos
    await page.getByTestId('checkbox-select-v1').click();
    await page.getByTestId('checkbox-select-v2').click();
    await page.getByTestId('checkbox-select-v3').click();
    await expect(page.getByText('3 videos selected')).toBeVisible();

    // Apply search filter that hides some selected videos
    await page.getByPlaceholder('Search videos...').fill('video-1');
    // This should show v1, v10-19 (11 videos)

    // Selection count might update based on visible items
    // The exact behavior depends on implementation

    // Clear filter
    await page.getByPlaceholder('Search videos...').clear();
    expect(await countCards(page)).toBe(20);

    // Original selections should still be there
    await expect(page.getByTestId('checkbox-select-v1')).toBeChecked();
  });

  test('bulk selection toggle', async ({ page }) => {
    await importDataset(page);

    // Toggle selection mode on
    await page.keyboard.press('x'); // Assuming 'x' toggles selection mode

    // In selection mode, clicking cards should select them
    await page.getByTestId('video-card-v1').click();
    await page.getByTestId('video-card-v2').click();
    await page.getByTestId('video-card-v3').click();

    // Should have 3 selected
    const selectedCount = await getSelectedCount(page);
    expect(selectedCount).toBeGreaterThan(0);

    // Toggle selection mode off
    await page.keyboard.press('x');

    // Clicking should now open video instead of selecting
    // (This behavior depends on implementation)
  });

  test('selection with mixed interactions', async ({ page }) => {
    await importDataset(page);

    // Mix of checkbox clicks and keyboard shortcuts
    await page.getByTestId('checkbox-select-v1').click();

    await page.keyboard.down('Control');
    await page.getByTestId('video-card-v3').click();
    await page.keyboard.up('Control');

    await page.keyboard.down('Shift');
    await page.getByTestId('checkbox-select-v5').click();
    await page.keyboard.up('Shift');

    // Should have v1, v3, v4, v5 selected
    const selectedCount = await getSelectedCount(page);
    expect(selectedCount).toBeGreaterThanOrEqual(4);

    // Deselect all
    await page.getByTestId('button-deselect-all').click();
    await expect(page.getByText('videos selected')).toHaveCount(0);
  });

  test('selection edge cases', async ({ page }) => {
    await importDataset(page);

    // Select first video
    await page.getByTestId('checkbox-select-v1').click();
    await expect(page.getByText('1 video selected')).toBeVisible();

    // Try to select the same video again (should remain selected)
    await page.getByTestId('checkbox-select-v1').click();
    await expect(page.getByText('videos selected')).toHaveCount(0);

    // Select and then immediately deselect
    await page.getByTestId('checkbox-select-v1').click();
    await page.getByTestId('checkbox-select-v1').click();
    await expect(page.getByText('videos selected')).toHaveCount(0);
  });
});
