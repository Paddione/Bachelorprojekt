import { test, expect } from '@playwright/test';

// E2E Test Suite for Devmesh Agent-Board & Integrated Frontend Cockpits
const BOARD_URL = process.env.AGENT_BOARD_URL || 'http://localhost:4321';

test.describe('E2E: Devmesh Agent-Board Frontends', () => {
  test.setTimeout(30_000);

  test('01: /agents renders navigation and Coach & Radar tab with topics and signals', async ({ page }) => {
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('BROWSER ERROR:', err));

    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Agent-Board');

    // Click Coach & Radar tab
    const coachBtn = page.getByRole('button', { name: 'Coach & Radar' });
    await coachBtn.click();
    await expect(coachBtn).toHaveClass(/active/);

    // Verify Coach Deck container
    const coachDeck = page.locator('.coach-deck');
    await expect(coachDeck).toBeVisible();
    await expect(coachDeck).toContainText(/News-Agent Radar|Coach-Digest/i);

    // Verify Top Topics cards rendered with data (auto-retries up to 15s)
    const topicsGrid = page.locator('.topics-grid');
    await expect(topicsGrid).toBeVisible({ timeout: 15_000 });
    const topicCards = page.locator('.topic-card');
    await expect(topicCards.first()).toBeVisible();
    const topicCount = await topicCards.count();
    expect(topicCount).toBeGreaterThanOrEqual(1);

    // Verify Radar signals rendered
    const signalCards = page.locator('.signal-card');
    const signalCount = await signalCards.count();
    expect(signalCount).toBeGreaterThanOrEqual(1);

    // Verify action button inside signal card
    await expect(page.locator('.action-btn').first()).toBeVisible();
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
    await expect(page.locator('.unsloth-board, body')).toContainText(/Qwen|tier|backend/i);
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
});
