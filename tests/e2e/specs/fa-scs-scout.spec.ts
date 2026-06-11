import { test, expect } from '@playwright/test';

// SCS Scout: verifies that the Factory DetailPanel shows semantically related files
// when the Scout phase injects suggested_files from the semantic code search.

interface HallItem {
  extId: string;
  title: string;
  priority: string;
  phase: string | null;
  phaseState: string | null;
  phaseSince: string | null;
  retryCount: number;
  blockReason: string | null;
  slot: number | null;
  driver: 'factory' | 'devflow' | null;
  prNumber: number | null;
  ciStatus: 'success' | 'pending' | 'failure' | null;
}

interface SuggestedFile {
  path: string;
  score: number;
  snippet: string;
}

interface TicketDetail {
  extId: string;
  title: string;
  events: Array<{ phase: string; state: string; timestamp: string }>;
  suggested_files?: SuggestedFile[];
}

const HALL_ITEM: HallItem = {
  extId: 'T000628',
  title: 'Semantic Code Search',
  priority: 'hoch',
  phase: 'scout',
  phaseState: 'entered',
  phaseSince: new Date().toISOString(),
  retryCount: 0,
  blockReason: null,
  slot: 1,
  driver: 'factory',
  prNumber: null,
  ciStatus: null,
};

const SUGGESTED_FILES: SuggestedFile[] = [
  { path: 'scripts/index-repo.ts', score: 0.92, snippet: 'pgvector-based code indexer with bge-m3 embeddings' },
  { path: 'website/src/lib/codesearch-db.ts', score: 0.87, snippet: 'Semantic search queries with graph augmentation' },
  { path: 'website/src/pages/api/codesearch.ts', score: 0.81, snippet: 'GET /api/codesearch endpoint' },
];

function stubHallPayload(hall: HallItem[]) {
  return {
    control: { killSwitch: false, slotsUsed: 1, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
    metrics: { shippedToday: 0, avgCycleH: null },
    loadingDock: [],
    hall,
    shipped: [],
    staged: [],
    officeWaiting: 0,
    stagedWaiting: 0,
    fetchedAt: new Date().toISOString(),
  };
}

function stubDetailPayload(detail: TicketDetail) {
  return detail;
}

test.describe('FA-SCS: Scout phase injects suggested_files', { tag: ['@admin', '@factory', '@scs'] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/factory-floor/stream', (route) => route.abort());
  });

  test('T1: DetailPanel shows suggested_files section when Scout returns results', async ({ page }) => {
    await page.route('**/api/factory-floor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stubHallPayload([HALL_ITEM])),
      }),
    );

    await page.route('**/api/factory-floor/*/detail', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stubDetailPayload({
          extId: HALL_ITEM.extId,
          title: HALL_ITEM.title,
          events: [{ phase: 'scout', state: 'done', timestamp: new Date().toISOString() }],
          suggested_files: SUGGESTED_FILES,
        })),
      }),
    );

    await page.goto('/dev-status');
    await expect(page.getByTestId('factory-floor')).toBeVisible();

    const workpiece = page.getByTestId('floor-workpiece').filter({ hasText: HALL_ITEM.extId });
    await expect(workpiece).toBeVisible();
    await workpiece.click();

    await expect(page.getByTestId('floor-detail')).toBeVisible();
    await expect(page.getByTestId('suggested-files')).toBeVisible();

    const items = page.getByTestId('suggested-files').locator('li');
    await expect(items).toHaveCount(SUGGESTED_FILES.length);

    await expect(items.first()).toContainText(SUGGESTED_FILES[0].path);
    await expect(items.first()).toContainText('92%');
  });

  test('T2: DetailPanel hides suggested_files section when Scout returns empty', async ({ page }) => {
    await page.route('**/api/factory-floor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stubHallPayload([HALL_ITEM])),
      }),
    );

    await page.route('**/api/factory-floor/*/detail', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stubDetailPayload({
          extId: HALL_ITEM.extId,
          title: HALL_ITEM.title,
          events: [{ phase: 'scout', state: 'done', timestamp: new Date().toISOString() }],
          suggested_files: [],
        })),
      }),
    );

    await page.goto('/dev-status');
    const workpiece = page.getByTestId('floor-workpiece').filter({ hasText: HALL_ITEM.extId });
    await expect(workpiece).toBeVisible();
    await workpiece.click();

    await expect(page.getByTestId('floor-detail')).toBeVisible();
    await expect(page.getByTestId('suggested-files')).toHaveCount(0);
  });

  test('T3: Suggested files show score-based color coding', async ({ page }) => {
    const mixedScores: SuggestedFile[] = [
      { path: 'high-score.ts', score: 0.95, snippet: 'Very relevant' },
      { path: 'mid-score.ts', score: 0.80, snippet: 'Somewhat relevant' },
      { path: 'low-score.ts', score: 0.65, snippet: 'Less relevant' },
    ];

    await page.route('**/api/factory-floor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stubHallPayload([HALL_ITEM])),
      }),
    );

    await page.route('**/api/factory-floor/*/detail', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stubDetailPayload({
          extId: HALL_ITEM.extId,
          title: HALL_ITEM.title,
          events: [{ phase: 'scout', state: 'done', timestamp: new Date().toISOString() }],
          suggested_files: mixedScores,
        })),
      }),
    );

    await page.goto('/dev-status');
    const workpiece = page.getByTestId('floor-workpiece').filter({ hasText: HALL_ITEM.extId });
    await workpiece.click();

    const items = page.getByTestId('suggested-files').locator('li');
    await expect(items).toHaveCount(3);

    await expect(items.nth(0)).toContainText('95%');
    await expect(items.nth(1)).toContainText('80%');
    await expect(items.nth(2)).toContainText('65%');
  });
});
