import { test, expect, type Page } from '@playwright/test';

// E2E Test Suite for Devmesh Agent-Board & Integrated Frontend Cockpits
const BOARD_URL = process.env.AGENT_BOARD_URL || 'http://localhost:4321';

// Svelte-Islands sind erst nach der Hydration bedienbar; Klicks davor gehen ins Leere.
// client:visible-Islands (z. B. LogsBoard unter dem Fold) hydrieren erst bei
// Sichtbarkeit — der Helper wartet auf alle client:load-Islands und toleriert
// die sichtbarkeitsgesteuerten.
async function hydrated(page: Page) {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('astro-island[ssr]')).every((el) => el.getAttribute('client') === 'visible'),
    null,
    { timeout: 15_000 },
  );
}

// Seite → Überschrift (h1, bei dns/github h2) und Refresh-Button-Name.
//
// Token-Hinweis /news (P5b): NewsBoard.svelte lädt /api/coach + NEWS_FEED_PATH
// + NEWS_QUESTIONS_PATH. Serverseitig antwortet der News-Proxy ohne
// DNA_NEWS_HUB_TOKEN mit 503 (agent-board/src/pages/api/news/[...path].ts).
// Das Token ist ein Server-Runtime-Secret des Board-Deployments (Cluster),
// kein CI-Env: weder tests/e2e/playwright.agent-board.config.ts noch
// .github/workflows/e2e.yml / e2e-pr.yml setzen DNA_NEWS_HUB_TOKEN oder
// AGENT_BOARD_URL (nur BOARD_URL/WEBSITE_URL gegen Prod). Der generische
// Test 10 meldet /api/-Antworten >= 400 als Fehler — ein Live-Run gegen ein
// Board ohne Token lässt /news dort rot werden. Live-E2E bleibt CI-/Primary-
// Sache; in diesem Paket kein Live-Run.
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
  // NewsBoard.svelte hat einen echten API-Reload-Button (button.refresh
  // „Aktualisieren" → refresh() fetcht /api/coach, NEWS_FEED_PATH und
  // NEWS_QUESTIONS_PATH), daher der refresh-Eintrag.
  { path: '/news', heading: /News/, refresh: /^Aktualisieren$/ },
];

test.describe('E2E: Devmesh Agent-Board Frontends', () => {
  test.setTimeout(30_000);

  test('01: /agents links to the news radar and /news renders digest, signals and cards', async ({ page }) => {
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('BROWSER ERROR:', err));

    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1')).toContainText('Agents');
    await hydrated(page);

    // P5a-Dedup: kein Coach-Tab mehr auf /agents. Radar-Einstieg ist der Link
    // nach /news (Board.svelte: a.radar-link[href="/news"] „Radar öffnen → /news").
    const radarLink = page.locator('a.radar-link[href="/news"]');
    await expect(radarLink).toBeVisible();
    await expect(radarLink).toContainText(/\/news/);

    await page.goto(`${BOARD_URL}/news`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1')).toContainText('News');
    await hydrated(page);

    // NewsBoard-Sektionen über verifizierte aria-labels (NewsBoard.svelte),
    // keine erfundenen Klassen.
    for (const section of ['Digest', 'Signale', 'Karten']) {
      await expect(page.locator(`section[aria-label="${section}"]`)).toBeVisible();
    }

    // Echter API-Reload-Button (NewsBoard.svelte: button.refresh „Aktualisieren").
    await expect(page.getByRole('button', { name: 'Aktualisieren' })).toBeEnabled({ timeout: 15_000 });

    // Je nach Hub-Lage: Inhalte mit Triage-Buttons (Signale: Signal/Fakten/
    // Hype/Keins; Karten: Mehr/Weniger) oder dokumentierte Leerzustände
    // (.coach-empty: „Keine Themen im Digest." / „Keine Outbox vorhanden — …" /
    // „Keine Signale — …" / „Keine Karten im Feed.").
    // Lade-Race (NewsBoard.svelte: loading=true bis refresh() fertig):
    // sofortiges count() sieht 0 Elemente. Retrying-Assertion wartet, bis
    // Triage-Buttons oder .coach-empty-Leerzustände gerendert sind.
    await expect.poll(async () => await page.locator('.triage button').count() + await page.locator('.coach-empty').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    const triageCount = await page.locator('.triage button').count();
    const emptyCount = await page.locator('.coach-empty').count();
    if (triageCount > 0) {
      await expect(page.locator('.triage button').first()).toBeVisible();
    } else {
      await expect(page.locator('.coach-empty').first()).toContainText(/Keine/);
    }

    // Rückweg nach /agents (NewsBoard.svelte: a.link „Zurück zu Agents").
    await expect(page.locator('a.link[href="/agents"]')).toBeVisible();
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
    // news ist Gruppe „betrieb" (cockpit.ts: COCKPIT_NAV) → Primärleiste.
    await page.goto(`${BOARD_URL}/news`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.bottom-nav-link[href="/news"]')).toHaveClass(/active/);
  });

  test('09: /agents sub-tabs switch content and mark the active tab', async ({ page }) => {
    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await hydrated(page);
    // Aktuelle Tab-Liste aus Board.svelte (VIEWS: Agents, Flows, Modelle,
    // Queue) — kein Coach-Tab mehr (P5a-Dedup). Namens-Match ohne exact:
    // Tabs enthalten den Count-Span (z. B. „Modelle 3"), exakt würde nie treffen.
    for (const name of ['Agents', 'Flows', 'Modelle', 'Queue']) {
      const tab = page.getByRole('tab', { name, exact: false });
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
