import { test, expect } from '@playwright/test';

const MOCK_ITEM = {
  ticketId: 'mock-uuid-0001',
  extId: 'T000099',
  title: 'Smoke QS Dark Mode',
  prNumber: 1234,
  deployedAt: new Date(Date.now() - 7200000).toISOString(),
  lastReview: null,
};

const MOCK_CRITERIA = [
  { key: 'spec_match',    label: 'Feature verhält sich wie spezifiziert' },
  { key: 'no_regression', label: 'Keine sichtbaren Regressions' },
  { key: 'responsive',    label: 'Mobile / Responsive OK' },
  { key: 'performance',   label: 'Ladezeit akzeptabel' },
  { key: 'copy',          label: 'Texte / Übersetzungen korrekt' },
];

async function setupMocks(page: any, qaItems = [MOCK_ITEM]) {
  await page.route('**/api/factory-floor', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      control: { killSwitch: false, slotsUsed: 0, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
      metrics: { shippedToday: 0, avgCycleH: null },
      loadingDock: [], hall: [], shipped: [], fetchedAt: new Date().toISOString(),
    })}),
  );
  await page.route('**/api/admin/qa-queue', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: qaItems }) }),
  );
  await page.route('**/api/admin/qa-criteria', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ criteria: MOCK_CRITERIA }) }),
  );
}

test.describe('FA-QS: QS-Abnahme', () => {
  test('FA-QS-01 Ticket mit qa_review erscheint in QS-Spalte', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    await expect(page.getByTestId('floor-qa')).toBeVisible();
    await expect(page.getByTestId('qa-chip-T000099')).toBeVisible();
  });

  test('FA-QS-02 Modal öffnet sich beim Klick und zeigt 5 Checkboxen', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    await expect(page.getByTestId('qa-modal')).toBeVisible();
    await expect(page.getByTestId('qa-checklist').locator('input[type="checkbox"]')).toHaveCount(5);
  });

  test('FA-QS-03 Abnehmen-Button disabled wenn nicht alle 5 gecheckt', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    await expect(page.getByTestId('qa-btn-approve')).toBeDisabled();
    const boxes = page.getByTestId('qa-checklist').locator('input[type="checkbox"]');
    for (let i = 0; i < 4; i++) await boxes.nth(i).check();
    await expect(page.getByTestId('qa-btn-approve')).toBeDisabled();
    await boxes.nth(4).check();
    await expect(page.getByTestId('qa-btn-approve')).toBeEnabled();
  });

  test('FA-QS-04 Approve: POST an qa-reviews, Modal schliesst sich', async ({ page }) => {
    await setupMocks(page);
    let posted = false;
    await page.route('**/api/admin/qa-reviews', (route: any) => {
      posted = true;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    const boxes = page.getByTestId('qa-checklist').locator('input[type="checkbox"]');
    for (let i = 0; i < 5; i++) await boxes.nth(i).check();
    await page.getByTestId('qa-btn-approve').click();
    await expect.poll(() => posted).toBe(true);
    await expect(page.getByTestId('qa-modal')).not.toBeVisible();
  });

  test('FA-QS-05 Reject: POST mit re_entry_phase und Kommentar, Modal schliesst sich', async ({ page }) => {
    await setupMocks(page);
    let requestBody: any;
    await page.route('**/api/admin/qa-reviews', async (route: any) => {
      requestBody = await route.request().postDataJSON();
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    const boxes = page.getByTestId('qa-checklist').locator('input[type="checkbox"]');
    await boxes.nth(0).check();
    await page.getByTestId('qa-notes').fill('Responsive auf Mobile kaputt');
    await expect(page.getByTestId('qa-btn-reject')).toBeEnabled();
    await page.getByTestId('qa-btn-reject').click();
    await expect.poll(() => requestBody).toBeTruthy();
    expect(requestBody.verdict).toBe('rejected');
    expect(requestBody.notes).toContain('Responsive');
    expect(requestBody.re_entry_phase).toBe('implement');
    await expect(page.getByTestId('qa-modal')).not.toBeVisible();
  });

  test('FA-QS-06 Badge zeigt 0/5 initial, keine Interaktion nötig', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    const chip = page.getByTestId('qa-chip-T000099');
    await expect(chip).toContainText('0/5');
  });
});
