import { test, expect } from '@playwright/test';
import { afterTestCleanup } from './test-utils';

/**
 * Performance verification test for grid with 5,000 items
 *
 * Acceptance criteria:
 * - Smooth scroll at 60fps on 5k items
 * - Memory plateaus (no continuous growth)
 * - No layout thrash per profiler
 */

function buildLargeFixture(count: number = 5000) {
  const now = new Date().toISOString();
  const base = {
    pathBase: '/root',
    rootKey: 'root-1',
  };

  const qualities = ['hd', 'sd', '4k', 'fullhd'];
  const acts = ['dancing', 'singing', 'running', 'jumping', 'walking'];
  const performers = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];

  const v = (id: string, name: string, index: number) => ({
    id,
    filename: `${name}.mp4`,
    displayName: name,
    path: `${base.pathBase}/${name}.mp4`,
    size: 1_000_000 + index * 10000,
    lastModified: now,
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [acts[index % acts.length]],
      setting: [],
      quality: [qualities[index % qualities.length]],
      performer: [performers[index % performers.length]],
    },
    customCategories: {},
    metadata: {
      duration: 60 + (index % 240),
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

  const videos = Array.from({ length: count }, (_, i) =>
    v(`v${i + 1}`, `video-${String(i + 1).padStart(5, '0')}`, i),
  );

  return {
    version: '1.0',
    exportDate: now,
    videos,
    totalVideos: videos.length,
  };
}

async function importLargeDataset(page: any, count: number = 5000) {
  console.log(`Generating ${count} mock videos...`);
  const data = Buffer.from(JSON.stringify(buildLargeFixture(count)), 'utf-8');

  console.log(`Importing ${count} videos...`);
  const fcPromise = page.waitForEvent('filechooser');
  await page.getByTestId('button-import-data').click();
  const fc = await fcPromise;
  await fc.setFiles({ name: 'large-import.json', mimeType: 'application/json', buffer: data });

  // Wait for first card to appear
  console.log('Waiting for first video card...');
  await page.getByTestId('video-card-v1').waitFor({ timeout: 30000 });

  // Wait a bit for the grid to stabilize
  await page.waitForTimeout(2000);
  console.log('Dataset imported successfully');
}

async function measureScrollPerformance(page: any): Promise<any> {
  // Start performance measurement
  const metrics = (await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      const measurements: number[] = [];
      let frameCount = 0;
      let lastTime = performance.now();
      let scrollCount = 0;

      const measureFrame = () => {
        const currentTime = performance.now();
        const delta = currentTime - lastTime;
        const fps = 1000 / delta;
        measurements.push(fps);
        lastTime = currentTime;
        frameCount++;

        if (frameCount < 120) {
          // Measure for ~2 seconds at 60fps
          requestAnimationFrame(measureFrame);
        } else {
          const avgFps = measurements.reduce((a, b) => a + b, 0) / measurements.length;
          const minFps = Math.min(...measurements);
          const maxFps = Math.max(...measurements);
          const below60Count = measurements.filter((fps) => fps < 60).length;
          const below30Count = measurements.filter((fps) => fps < 30).length;

          resolve({
            avgFps,
            minFps,
            maxFps,
            below60Percent: (below60Count / measurements.length) * 100,
            below30Percent: (below30Count / measurements.length) * 100,
            totalFrames: frameCount,
          });
        }
      };

      // Trigger scroll
      const container = document.querySelector('[data-testid="main-content"]') || document.body;
      let scrollTop = 0;
      const scrollInterval = setInterval(() => {
        scrollTop += 100;
        (container as any).scrollTop = scrollTop;
        scrollCount++;

        if (scrollCount >= 20) {
          // Scroll 20 times
          clearInterval(scrollInterval);
        }
      }, 100);

      requestAnimationFrame(measureFrame);
    });
  })) as Promise<any>;

  return metrics as any;
}

async function measureMemoryUsage(page: any): Promise<any> {
  const metrics: any = await page.evaluate(() => {
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      return {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        usedMB: Math.round(mem.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(mem.totalJSHeapSize / 1024 / 1024),
      };
    }
    return null;
  });

  return metrics;
}

test.describe('Grid Performance with 5k items', () => {
  test.setTimeout(120000); // 2 minutes timeout for large dataset

  // Clean up test data after all tests complete
  test.afterAll(async ({ page }) => {
    await afterTestCleanup(page);
  });

  test('should handle 5000 items with smooth scrolling and stable memory', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    await page.getByTestId('button-import-data').waitFor();

    // Import 5000 videos
    await importLargeDataset(page, 5000);

    // Measure initial memory
    console.log('Measuring initial memory...');
    const initialMemory = await measureMemoryUsage(page);
    console.log('Initial memory:', initialMemory);

    // Wait for virtualization to kick in
    await page.waitForTimeout(1000);

    // Verify virtualization is active
    const isVirtualized = await page.evaluate(() => {
      const grid = document.querySelector('.optimized-virtual-grid');
      return grid !== null;
    });

    console.log('Virtualization active:', isVirtualized);
    expect(isVirtualized).toBe(true);

    // Measure scroll performance
    console.log('Measuring scroll performance...');
    const scrollMetrics: any = await measureScrollPerformance(page);
    console.log('Scroll performance:', scrollMetrics);

    // Measure memory after scrolling
    console.log('Measuring memory after scrolling...');
    const afterScrollMemory = await measureMemoryUsage(page);
    console.log('Memory after scroll:', afterScrollMemory);

    // Performance assertions
    console.log('\n=== PERFORMANCE RESULTS ===');
    console.log(`Average FPS: ${scrollMetrics.avgFps.toFixed(2)}`);
    console.log(`Min FPS: ${scrollMetrics.minFps.toFixed(2)}`);
    console.log(`Max FPS: ${scrollMetrics.maxFps.toFixed(2)}`);
    console.log(`Frames below 60fps: ${scrollMetrics.below60Percent.toFixed(2)}%`);
    console.log(`Frames below 30fps: ${scrollMetrics.below30Percent.toFixed(2)}%`);

    if (initialMemory && afterScrollMemory) {
      const memoryGrowth = afterScrollMemory.usedMB - initialMemory.usedMB;
      console.log(
        `Memory growth: ${memoryGrowth}MB (${initialMemory.usedMB}MB -> ${afterScrollMemory.usedMB}MB)`,
      );

      // Memory should not grow excessively (allow up to 50MB growth for 5k items)
      expect(memoryGrowth).toBeLessThan(50);
    }

    // Average FPS should be close to 60 (allow some variance)
    expect(scrollMetrics.avgFps).toBeGreaterThan(45);

    // Less than 20% of frames should drop below 60fps
    expect(scrollMetrics.below60Percent).toBeLessThan(20);

    // Almost no frames should drop below 30fps
    expect(scrollMetrics.below30Percent).toBeLessThan(5);

    console.log('=========================\n');
  });

  test('should maintain performance with filtering on 5k items', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('button-import-data').waitFor();

    // Import 5000 videos
    await importLargeDataset(page, 5000);

    // Apply a filter
    console.log('Applying filter...');
    await page.getByTestId('category-quality:hd').getByRole('checkbox').check();

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Count filtered results
    const filteredCount = await page.locator('[data-testid^="video-card-"]').count();
    console.log(`Filtered to ${filteredCount} videos`);

    // Should still have many items (roughly 1/4 of 5000)
    expect(filteredCount).toBeGreaterThan(1000);
    expect(filteredCount).toBeLessThan(1500);

    // Measure performance with filtered results
    const scrollMetrics: any = await measureScrollPerformance(page);
    console.log('Filtered scroll performance:', scrollMetrics);

    // Performance should still be good
    expect(scrollMetrics.avgFps).toBeGreaterThan(45);
    expect(scrollMetrics.below30Percent).toBeLessThan(5);
  });

  test('should handle rapid scrolling without layout thrash', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('button-import-data').waitFor();

    // Import 5000 videos
    await importLargeDataset(page, 5000);

    // Perform rapid scrolling
    console.log('Testing rapid scrolling...');
    const layoutShiftScore = (await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let totalShift = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              totalShift += (entry as any).value;
            }
          }
        });

        observer.observe({ entryTypes: ['layout-shift'] });

        // Rapid scroll
        const container = document.querySelector('[data-testid="main-content"]') || document.body;
        let scrollTop = 0;
        const interval = setInterval(() => {
          scrollTop += 500; // Large jumps
          (container as any).scrollTop = scrollTop;
        }, 50);

        setTimeout(() => {
          clearInterval(interval);
          observer.disconnect();
          resolve(totalShift);
        }, 2000);
      });
    })) as Promise<number>;

    console.log(`Cumulative Layout Shift: ${String(layoutShiftScore)}`);

    // CLS should be very low (< 0.1 is good, < 0.25 is acceptable)
    expect(layoutShiftScore).toBeLessThan(0.25);
  });
});
