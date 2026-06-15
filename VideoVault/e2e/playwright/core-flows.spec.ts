import { test, expect } from '@playwright/test';

const MOCK_VIDEOS = [
  {
    id: 'v1',
    displayName: 'Video 1',
    fileName: 'video1.mp4',
    size: 1024 * 1024 * 10,
    lastModified: Date.now(),
    path: '/videos/video1.mp4',
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: ['HD'],
      performer: [],
    },
    customCategories: {},
    metadata: { duration: 60, width: 1920, height: 1080 },
    thumbnail: { dataUrl: 'data:image/png;base64,', generated: true },
    rootKey: 'root1',
  },
  {
    id: 'v2',
    displayName: 'Video 2',
    fileName: 'video2.mp4',
    size: 1024 * 1024 * 20,
    lastModified: Date.now(),
    path: '/videos/video2.mp4',
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: ['4K'],
      performer: [],
    },
    customCategories: {
      genre: ['action'],
    },
    metadata: { duration: 120, width: 3840, height: 2160 },
    thumbnail: { dataUrl: 'data:image/png;base64,', generated: true },
    rootKey: 'root1',
  },
];

test.describe('Core Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    // Mock health check
    await page.route('**/api/health', async (route) => {
      await route.fulfill({ json: { status: 'healthy' } });
    });

    // Mock videos responses
    await page.route('**/api/videos*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('search')) {
        const query = url.searchParams.get('search')?.toLowerCase() || '';
        const filtered = MOCK_VIDEOS.filter((v) => v.displayName.toLowerCase().includes(query));
        await route.fulfill({ json: filtered });
        return;
      }
      await route.fulfill({ json: MOCK_VIDEOS });
    });

    await page.route('**/api/roots', async (route) => {
      await route.fulfill({ json: [{ key: 'root1', path: '/videos' }] });
    });

    await page.route('**/api/settings', async (route) => {
      await route.fulfill({ json: {} });
    });

    await page.route('**/api/presets', async (route) => {
      await route.fulfill({ json: [] });
    });

    // Mock bulk operations
    await page.route('**/api/videos/batch_rename', async (route) => {
      await route.fulfill({ json: { success: true, count: 1 } });
    });

    await page.route('**/api/videos/batch_delete', async (route) => {
      await route.fulfill({ json: { success: true, count: 1 } });
    });

    page.on('console', (msg) => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[Browser PageError]: ${err.message}`));
    page.on('request', (request) =>
      console.log(`[Browser Request] ${request.method()} ${request.url()}`),
    );
    page.on('response', (response) =>
      console.log(`[Browser Response] ${response.status()} ${response.url()}`),
    );

    await page.goto('/');
  });

  test('Filtering Combos', async ({ page }) => {
    // Wait for videos to load
    try {
      await expect(page.getByText('Video 1')).toBeVisible();
      await expect(page.getByText('Video 2')).toBeVisible();
    } catch (e) {
      console.log('[DEBUG] Page Content:', await page.content());
      throw e;
    }

    // Apply search filter
    const searchInput = page.getByPlaceholder('Search videos...');
    await searchInput.fill('Video 1');

    // Verify filtering
    await expect(page.getByText('Video 1')).toBeVisible();
    await expect(page.getByText('Video 2')).not.toBeVisible();

    // Clear filter
    await searchInput.clear();
    await expect(page.getByText('Video 2')).toBeVisible();
  });

  test('Bulk Operations - Rename', async ({ page }) => {
    // Enable selection mode (usually by holding shift or clicking select button if exists)
    // Assuming there's a way to select. If not, we might need to trigger it.
    // Based on `BulkOperationsService`, there are keyboard shortcuts.
    // Let's try to select the first video.

    // Hover over video card to reveal checkbox or just click if selection mode is toggleable
    // Or use keyboard shortcut 'x' if implemented, or Ctrl+Click

    // Let's try Ctrl+Click on the video card
    await page.keyboard.down('Control');
    await page.getByText('Video 1').click();
    await page.getByText('Video 2').click();
    await page.keyboard.up('Control');

    // Check if selection mode is active and items are selected
    await expect(page.getByText('2 selected')).toBeVisible();

    // Trigger Batch Rename
    await page.getByRole('button', { name: 'Rename' }).click();

    // Fill rename pattern
    await page.getByPlaceholder('Pattern').fill('New Name - {original}');

    // Confirm
    await page.getByRole('button', { name: 'Rename', exact: true }).click(); // The modal confirm button

    // Verify optimistic update or success message
    // Since we mocked the API, we expect success
    // The UI might update the name immediately
    // Or show a toast
    await expect(page.getByText('Batch rename started')).toBeVisible();
  });

  test('Bulk Operations - Delete', async ({ page }) => {
    // Select videos
    await page.keyboard.down('Control');
    await page.getByText('Video 1').click();
    await page.getByText('Video 2').click();
    await page.keyboard.up('Control');

    await expect(page.getByText('2 selected')).toBeVisible();

    // Trigger Batch Delete
    await page.getByRole('button', { name: 'Delete' }).click();

    // Confirm delete
    await page.getByRole('button', { name: 'Delete', exact: true }).click(); // Modal confirm

    // Verify removal
    await expect(page.getByText('Video 1')).not.toBeVisible();
    await expect(page.getByText('Video 2')).not.toBeVisible();
  });
});
