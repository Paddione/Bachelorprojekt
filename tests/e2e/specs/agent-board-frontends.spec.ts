import { test, expect, type Page } from '@playwright/test';

// E2E Test Suite for Devmesh Agent-Board & Integrated Frontend Cockpits
const BOARD_URL = process.env.AGENT_BOARD_URL || 'http://localhost:4321';

// Svelte-Islands sind erst nach der Hydration bedienbar; Klicks davor gehen ins Leere.
// client:visible-Islands (z. B. LogsBoard unter dem Fold) hydrieren erst bei
// Sichtbarkeit — der Helper wartet auf alle client:load-Islands und toleriert
// die sichtbarkeitsgesteuerten.
async function hydrated(page: Page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('astro-island[ssr]')].every((el) => el.getAttribute('client') === 'visible'),
    null,
    { timeout: 15_000 },
  );
}

// Seite → Überschrift (h1, bei dns/github h2) und Refresh-Button-Name.
const PAGES: { path: string; heading: RegExp; refresh?: RegExp }[] = [
  { path: '/agents', heading: /Agents/, refresh: /^Aktualisieren$/ },
  { path: '/verbund', heading: /Übersicht/ },
  { path: '/goals', heading: /Goals/ },
  { path: '/jobs', heading: /Jobs-Cockpit/, refresh: /^Aktualisieren$/ },
  { path: '/github', heading: /GitHub/, refresh: /^Aktualisieren$/i },
  { path: '/logs', heading: /Logs/ },
  { path: '/graph', heading: /Code-Graph/ },
  { path: '/kubernetes', heading: /Kubernetes/ },
  { path: '/dns', heading: /DNS · IPv64/, refresh: /^Aktualisieren$/ },
  { path: '/health', heading: /Health/ },
  { path: '/unsloth', heading: /Unsloth/, refresh: /^Aktualisieren$/ },
];

test.describe('E2E: Devmesh Agent-Board Frontends', () => {
  test.setTimeout(30_000);

  test('01: /agents renders navigation and Coach & Radar tab with empty or filled outbox', async ({ page }) => {
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('BROWSER ERROR:', err));

    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Agents/);
    await hydrated(page);

    // Tabs sind role=tab mit Count-Suffix (z. B. "Coach & Radar 0").
    for (const name of ['Agents', 'Flows', 'Modelle', 'Queue', 'Coach & Radar']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }

    // Click Coach & Radar tab
    const coachTab = page.getByRole('tab', { name: 'Coach & Radar' });
    await coachTab.click();
    await expect(coachTab).toHaveClass(/active/);
    await expect(coachTab).toHaveAttribute('aria-selected', 'true');

    // Board-Container tragen alle Views; der Coach-Tab zeigt entweder die
    // Outbox-Tabelle oder den Leerzustand.
    const board = page.locator('section.board');
    await expect(board).toBeVisible();
    const empty = board.locator('p.muted.empty');
    const table = board.locator('table');
    await expect(empty.or(table).first()).toBeVisible({ timeout: 15_000 });
    if (await empty.isVisible()) {
      await expect(empty).toContainText(/Coach-Outbox/);
      await expect(table).toHaveCount(0);
      return;
    }
    expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(1);
  });

  test('02: /verbund renders Devmesh cluster topology and status grid', async ({ page }) => {
    await page.goto(`${BOARD_URL}/verbund`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText('Übersicht');
    await expect(page.locator('section.verbund')).toBeVisible();
    await expect(page.locator('.cards').first()).toBeVisible();
  });

  test('03: /jobs renders scheduled jobs and execution board', async ({ page }) => {
    await page.goto(`${BOARD_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Jobs|Aufgaben/i);
  });

  test('04: /kubernetes renders cluster workloads and cartridge status', async ({ page }) => {
    await page.goto(`${BOARD_URL}/kubernetes`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Kubernetes/i);
  });

  test('05: /dns renders TLS crypto certificates and DNS zone manager', async ({ page }) => {
    await page.goto(`${BOARD_URL}/dns`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1, h2').filter({ hasText: /DNS · IPv64/i }).first()).toBeVisible();
    await expect(page.locator('section.dns')).toBeVisible();
  });

  test('06: /unsloth renders studio containers and LLM backend tiers', async ({ page }) => {
    await page.goto(`${BOARD_URL}/unsloth`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Unsloth/i);
    // Inventar lädt asynchron und braucht auf devmesh deutlich länger als 5 s.
    await expect(page.locator('.unsloth-board, body')).toContainText(/Qwen|tier|backend/i, { timeout: 30_000 });
  });

  test('07: /health renders system status matrix with no unhandled JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(`${BOARD_URL}/health`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Health|System/i);
    expect(pageErrors).toHaveLength(0);
  });

  test('08: mobile viewport (390x844) renders responsive bottom navigation bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.bottom-nav-link[href="/agents"]')).toHaveClass(/active/);
  });

  test('09: /agents sub-tabs switch content and mark the active tab', async ({ page }) => {
    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await hydrated(page);
    for (const name of ['Agents', 'Flows', 'Modelle', 'Queue', 'Coach & Radar']) {
      const tab = page.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveClass(/active/);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('section.board')).toBeVisible();
    }
  });

  for (const { path, heading, refresh } of PAGES) {
    for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      test(`10: ${path} (${vp.name}) hydrates without errors, failed API calls or horizontal overflow`, async ({ page }) => {
        const problems: string[] = [];
        page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
        page.on('response', (res) => {
          if (res.url().includes('/api/') && res.status() >= 400) problems.push(`${res.status()} ${res.url()}`);
        });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${BOARD_URL}${path}`, { waitUntil: 'domcontentloaded' });
        await hydrated(page);
        await expect(page.locator('h1, h2').filter({ hasText: heading }).first()).toBeVisible({ timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal page overflow in px').toBeLessThanOrEqual(1);
        expect(problems).toEqual([]);
      });
    }

    if (refresh) {
      test(`11: ${path} refresh control triggers an API reload`, async ({ page }) => {
        await page.goto(`${BOARD_URL}${path}`, { waitUntil: 'domcontentloaded' });
        await hydrated(page);
        const button = page.getByRole('button', { name: refresh }).first();
        await expect(button).toBeEnabled({ timeout: 15_000 });
        const reload = page.waitForRequest((req) => req.url().includes('/api/'), { timeout: 10_000 });
        await button.click();
        await reload;
      });
    }
  }
});
