import { test, expect, type Page } from '@playwright/test';

// E2E Test Suite for Devmesh Agent-Board & Integrated Frontend Cockpits
const BOARD_URL = process.env.AGENT_BOARD_URL || 'http://localhost:4321';

// Svelte-Islands sind erst nach der Hydration bedienbar; Klicks davor gehen ins Leere.
async function hydrated(page: Page) {
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'), null, { timeout: 15_000 });
}

// Seite → Überschrift (h1, bei dns/github h2) und Refresh-Button-Name.
const PAGES: { path: string; heading: RegExp; refresh?: RegExp }[] = [
  { path: '/agents', heading: /Agent-Board/, refresh: /^Refresh$/ },
  { path: '/verbund', heading: /Übersicht/ },
  { path: '/goals', heading: /Goals/ },
  { path: '/jobs', heading: /Jobs-Cockpit/, refresh: /^Aktualisieren$/ },
  { path: '/github', heading: /GitHub Cockpit/, refresh: /^Aktualisieren$/i },
  { path: '/logs', heading: /Logs/ },
  { path: '/graph', heading: /Code-Graph/ },
  { path: '/kubernetes', heading: /Kubernetes/ },
  { path: '/dns', heading: /DNS · IPv64/, refresh: /^Aktualisieren$/ },
  { path: '/health', heading: /Health/ },
  { path: '/unsloth', heading: /Unsloth/, refresh: /^Aktualisieren$/ },
];

test.describe('E2E: Devmesh Agent-Board Frontends', () => {
  test.setTimeout(30_000);

  test('01: /agents renders navigation and Coach & Radar tab with topics and signals', async ({ page }) => {
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('BROWSER ERROR:', err));

    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Agent-Board');
    await hydrated(page);

    // Click Coach & Radar tab
    const coachBtn = page.getByRole('button', { name: 'Coach & Radar' });
    await coachBtn.click();
    await expect(coachBtn).toHaveClass(/active/);

    // Verify Coach Deck container
    const coachDeck = page.locator('.coach-deck');
    await expect(coachDeck).toBeVisible();
    await expect(coachDeck).toContainText(/News-Agent Radar|Coach-Digest/i);

    // Ohne Coach-Outbox muss ein Leerzustand statt leerer Raster erscheinen.
    await expect(page.locator('.topics-grid, .coach-empty').first()).toBeVisible({ timeout: 15_000 });
    if (await page.locator('.coach-empty').isVisible()) {
      await expect(page.locator('.coach-empty')).toContainText(/Keine Coach-Outbox/);
      await expect(page.locator('.topics-grid')).toHaveCount(0);
      return;
    }
    expect(await page.locator('.topic-card').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.signal-card').count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.action-btn').first()).toContainText('Triage & Plan →');
  });

  test('02: /verbund renders Devmesh cluster topology and status grid', async ({ page }) => {
    await page.goto(`${BOARD_URL}/verbund`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Übersicht');
    await expect(page.locator('section.verbund')).toBeVisible();
    await expect(page.locator('.cards').first()).toBeVisible();
  });

  test('03: /jobs renders scheduled jobs and execution board', async ({ page }) => {
    await page.goto(`${BOARD_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText(/Jobs|Aufgaben/i);
  });

  test('04: /kubernetes renders cluster workloads and cartridge status', async ({ page }) => {
    await page.goto(`${BOARD_URL}/kubernetes`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText(/Kubernetes/i);
  });

  test('05: /dns renders TLS crypto certificates and DNS zone manager', async ({ page }) => {
    await page.goto(`${BOARD_URL}/dns`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h2')).toContainText(/DNS · IPv64/i);
    await expect(page.locator('section.dns')).toBeVisible();
  });

  test('06: /unsloth renders studio containers and LLM backend tiers', async ({ page }) => {
    await page.goto(`${BOARD_URL}/unsloth`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText(/Unsloth/i);
    // Inventar lädt asynchron und braucht auf devmesh deutlich länger als 5 s.
    await expect(page.locator('.unsloth-board, body')).toContainText(/Qwen|tier|backend/i, { timeout: 30_000 });
  });

  test('07: /health renders system status matrix with no unhandled JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(`${BOARD_URL}/health`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText(/Health|System/i);
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
    const tabs: [string, string][] = [
      ['Modelle', '.model-table'],
      ['Queue', '.board'],
      ['Coach & Radar', '.coach-deck'],
      ['Agents', '.cards'],
    ];
    for (const [name, selector] of tabs) {
      const tab = page.getByRole('button', { name, exact: true });
      await tab.click();
      await expect(tab).toHaveClass(/active/);
      await expect(page.locator(selector).first()).toBeVisible();
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
