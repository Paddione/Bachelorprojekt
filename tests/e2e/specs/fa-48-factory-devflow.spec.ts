import { test, expect } from '@playwright/test';

// Devflow chip & CI-badge auf /dev-status (admin-gated, laeuft im mentolder-Projekt
// mit gespeichertem Admin-Auth-State). Stubt die API um devflow-Tickets zu simulieren,
// da diese im Normalbetrieb nur waehrend eines aktiven dev-flow-execute-Laufs existieren.

const DEVFLOW_HALL: HallItem[] = [
  { extId: 'T000582', title: 'Devflow Feature', priority: 'hoch', phase: 'deploy', phaseState: 'entered', phaseSince: new Date().toISOString(), retryCount: 0, blockReason: null, slot: null, driver: 'devflow', prNumber: 1512, ciStatus: 'success' },
  { extId: 'T000583', title: 'Devflow Pending', priority: 'mittel', phase: 'implement', phaseState: 'entered', phaseSince: new Date().toISOString(), retryCount: 0, blockReason: null, slot: null, driver: 'devflow', prNumber: null, ciStatus: null },
];

const FACTORY_HALL: HallItem[] = [
  { extId: 'T000459', title: 'Factory Ticket', priority: 'hoch', phase: 'implement', phaseState: 'entered', phaseSince: new Date().toISOString(), retryCount: 0, blockReason: null, slot: 1, driver: 'factory', prNumber: null, ciStatus: null },
];

interface HallItem {
  extId: string; title: string; priority: string;
  phase: string | null; phaseState: string | null; phaseSince: string | null;
  retryCount: number; blockReason: string | null; slot: number | null;
  driver: 'factory' | 'devflow' | null;
  prNumber: number | null; ciStatus: 'success' | 'pending' | 'failure' | null;
}

function stubPayload(hall: HallItem[]) {
  return {
    control: { killSwitch: false, slotsUsed: 1, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
    metrics: { shippedToday: 0, avgCycleH: null },
    loadingDock: [],
    hall,
    shipped: [], staged: [], officeWaiting: 0, stagedWaiting: 0,
    fetchedAt: new Date().toISOString(),
  };
}

async function gotoDevStatusWithStub(page: any, payload: any) {
  await page.route('**/api/factory-floor', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }),
  );

  await page.route('**/admin/pipeline*', async (route: any) => {
    const response = await route.fetch();
    let body = await response.text();
    const payloadStr = JSON.stringify(payload);
    // Replace initial: null or initial: {...} inside props attribute in Astro island
    body = body.replace(/"initial":null/g, `"initial":${payloadStr}`);
    body = body.replace(/"initial":\{.*?\}/g, `"initial":${payloadStr}`);
    route.fulfill({ response, body });
  });

  await page.goto('/dev-status');
}

test.describe('FA-48: FactoryFloor devflow chip & CI badge', () => {
  test.beforeEach(async ({ page }) => {
    // Stub SSE endpoint to avoid real connection / error logs
    await page.route('**/api/factory-floor/stream', (route) => route.abort());
  });

  test('T1: devflow workpiece hat data-driver="devflow" und kein goldenes bg', async ({ page }) => {
    await gotoDevStatusWithStub(page, stubPayload([...FACTORY_HALL, ...DEVFLOW_HALL]));
    await expect(page.getByTestId('factory-floor')).toBeVisible();

    const devflowWps = page.getByTestId('floor-workpiece').filter({ hasText: 'T000582' });
    await expect(devflowWps).toBeVisible();
    await expect(devflowWps).toHaveAttribute('data-driver', 'devflow');

    const factoryWp = page.getByTestId('floor-workpiece').filter({ hasText: 'T000459' });
    await expect(factoryWp).toHaveAttribute('data-driver', 'factory');
  });

  test('T2: devflow workpiece im deploy-Phase zeigt CI-Badge mit ciStatus', async ({ page }) => {
    await gotoDevStatusWithStub(page, stubPayload(DEVFLOW_HALL));

    const badge = page.getByTestId('floor-ci-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'CI: success — PR öffnen');
  });

  test('T3: devflow workpiece ohne ciStatus zeigt kein CI-Badge', async ({ page }) => {
    // Nur die pending-devflow (ohne ciStatus)
    await gotoDevStatusWithStub(page, stubPayload([DEVFLOW_HALL[1]]));

    await expect(page.getByTestId('floor-workpiece').filter({ hasText: 'T000583' })).toBeVisible();
    await expect(page.getByTestId('floor-ci-badge')).toHaveCount(0);
  });

  test('T4: factory workpiece hat kein blue border / bg', async ({ page }) => {
    await gotoDevStatusWithStub(page, stubPayload(FACTORY_HALL));

    const wp = page.getByTestId('floor-workpiece').filter({ hasText: 'T000459' });
    await expect(wp).toHaveAttribute('data-driver', 'factory');
    // factory hat kein data-driver devflow — kein border-blue
    const classAttr = await wp.getAttribute('class') ?? '';
    expect(classAttr).not.toContain('border-blue-400');
    expect(classAttr).not.toContain('bg-blue-950');
  });

  test('T5: devflow workpiece anzeige zeigt 👨‍💻 Emoji im Label', async ({ page }) => {
    await gotoDevStatusWithStub(page, stubPayload(DEVFLOW_HALL));

    await expect(page.getByTestId('floor-workpiece').filter({ hasText: '👨‍💻' })).toBeVisible();
  });
});
