import { Page } from '@playwright/test';

/**
 * Cleanup utility for Playwright tests
 * Deletes all test data from the database
 */
export async function cleanupTestData(page: Page) {
  try {
    // Get all videos
    // Using relative path will use baseURL from config
    const response = await page.request.get('/api/videos');
    if (!response.ok()) {
      console.warn(`Failed to fetch videos for cleanup: ${response.status()}`);
      return;
    }

    const videos = (await response.json()) as Array<{ id: string }>;

    if (videos.length > 0) {
      // Delete all videos
      const videoIds = videos.map((v) => v.id);
      const deleteResponse = await page.request.post('/api/videos/batch_delete', {
        data: { ids: videoIds },
        headers: { 'Content-Type': 'application/json' },
      });

      if (deleteResponse.ok()) {
        const result = (await deleteResponse.json()) as { deleted?: number; success?: number };
        console.log(`Cleaned up ${result.deleted || result.success || 0} test videos`);
      } else {
        console.warn(`Failed to delete videos: ${deleteResponse.status()}`);
      }
    }

    // Clear settings to ensure clean state
    await page.request.delete('/api/settings/vv.settings');
    await page.request.delete('/api/settings/vv.sort');

    // Get and delete all roots except production ones
    const rootsResponse = await page.request.get('/api/roots');
    if (rootsResponse.ok()) {
      const rootsData = (await rootsResponse.json()) as { roots?: Array<{ rootKey: string }> };
      const roots = rootsData.roots || [];

      for (const root of roots) {
        if (
          root.rootKey === 'root-1' ||
          root.rootKey === 'test_root' ||
          root.rootKey.includes('test')
        ) {
          const deleteRootResponse = await page.request.delete(
            `/api/roots/${root.rootKey}`,
          );
          if (deleteRootResponse.ok()) {
            console.log(`Deleted test root: ${root.rootKey}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
}

/**
 * Cleanup function that can be used in afterEach or afterAll hooks
 */
export async function afterTestCleanup(page: Page) {
  console.log('Running test cleanup...');
  await cleanupTestData(page);
}

