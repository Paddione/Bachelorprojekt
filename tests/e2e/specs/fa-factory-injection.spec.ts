import { test, expect } from '@playwright/test';

// Smoke: the inject form renders inside the /dev-status detail panel and submitting
// it issues a POST to /api/factory-floor/<id>/inject. Network is stubbed so the smoke
// needs no live pipeline. Runs in the `website` project (stored admin auth state),
// mirroring fa-factory-floor.spec.ts. [factory-injection]
test.describe('FactoryFloor injection', () => {
  test('inject form renders in the detail panel and POSTs to the inject endpoint', async ({ page }) => {
    // Stub the floor payload so a clickable hall workpiece exists without a live pipeline.
    await page.route('**/api/factory-floor', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        control: { killSwitch: false, slotsUsed: 1, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
        metrics: { shippedToday: 0, avgCycleH: null },
        loadingDock: [],
        hall: [{ extId: 'T000459', title: 'Smoke', priority: 'hoch', phase: 'implement', phaseState: 'entered', phaseSince: new Date().toISOString(), retryCount: 0, blockReason: null, slot: 1 }],
        shipped: [], fetchedAt: new Date().toISOString(),
      }) }));
    await page.route('**/api/factory-floor/T000459', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        extId: 'T000459', title: 'Smoke', status: 'in_progress', priority: 'hoch', retryCount: 0, prNumber: null,
        events: [], breadcrumbs: [], injections: [],
      }) }));
    let posted = false;
    await page.route('**/api/factory-floor/T000459/inject', (route) => {
      posted = true;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'x' }) });
    });

    await page.goto('/dev-status');
    await page.getByTestId('floor-workpiece').first().click();
    await expect(page.getByTestId('floor-detail')).toBeVisible();
    await page.getByTestId('inject-form').click(); // open <details>
    await page.getByTestId('inject-content').fill('smoke context');
    await page.getByTestId('inject-submit').click();
    await expect.poll(() => posted).toBe(true);
  });
});
