import { test, expect } from '@playwright/test';
import { BASE, loginAsAdmin, getCookieString, WissensquellenPage, assertWissensquellenReachable } from '../lib/wissensquellen-fixtures';

// ── Auth-gating: unauthenticated API access ──────────────────────────────────

test.describe('Wissensquellen API auth-gating', () => {
  test('GET /admin/wissensquellen redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/wissensquellen`);
    await expect(page).not.toHaveURL(`${BASE}/admin/wissensquellen`);
  });

  test('GET /api/admin/knowledge/collections returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/knowledge/collections`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/knowledge/collections returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: { name: 'test', source: 'custom' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/knowledge/collections/[id] returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/knowledge/collections/00000000-0000-0000-0000-000000000000`);
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/admin/knowledge/collections/[id] returns 401 without auth', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/admin/knowledge/collections/00000000-0000-0000-0000-000000000000`);
    expect([401, 403]).toContain(res.status());
  });

  test('PATCH /api/admin/knowledge/collections/[id]/crawl-config returns 401 without auth', async ({ request }) => {
    const res = await request.patch(
      `${BASE}/api/admin/knowledge/collections/00000000-0000-0000-0000-000000000000/crawl-config`,
      { data: { startUrl: 'https://example.com' } },
    );
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/knowledge/collections/[id]/crawl returns 401 without auth', async ({ request }) => {
    const res = await request.post(
      `${BASE}/api/admin/knowledge/collections/00000000-0000-0000-0000-000000000000/crawl`,
    );
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/knowledge/collections/[id]/crawl returns 401 without auth', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/admin/knowledge/collections/00000000-0000-0000-0000-000000000000/crawl`,
    );
    expect([401, 403]).toContain(res.status());
  });
});

// ── Custom source: create/delete via UI ─────────────────────────────────────

test.describe('Wissensquellen admin — custom source', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertWissensquellenReachable(request, testInfo);
  });
  test.setTimeout(120_000);

  test('create custom collection (no paste content avoids embedding dependency)', async ({ page }) => {
    const stamp = `e2e-${Date.now()}`;
    const wPage = new WissensquellenPage(page);
    await loginAsAdmin(page);
    const response = await wPage.createCustomCollection(stamp);
    expect(response.status()).toBe(201);
    const created = await response.json();

    await wPage.goto();
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 30_000 });

    await wPage.deleteCollectionRow(stamp, created.id);
    await expect(row).not.toBeVisible({ timeout: 30_000 });
  });
});

// ── Web crawl source: API validation + lifecycle ─────────────────────────────

test.describe('Wissensquellen — web_crawl collection API', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertWissensquellenReachable(request, testInfo);
  });
  test.setTimeout(120_000);

  async function getAuthCookie(request: import('@playwright/test').APIRequestContext) {
    const loginPage = await request.get(`${BASE}/api/auth/login?returnTo=/admin/wissensquellen`);
    return loginPage.headers()['set-cookie'] ?? '';
  }

  test('POST /api/admin/knowledge/collections rejects web_crawl without startUrl', async ({ request, page }) => {
    const cookie = await getCookieString(page);


    const res = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: { name: `e2e-no-url-${Date.now()}`, source: 'web_crawl' },
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/startUrl/);
  });

  test('POST /api/admin/knowledge/collections rejects invalid startUrl', async ({ request, page }) => {
    const cookie = await getCookieString(page);


    const res = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: {
        name: `e2e-bad-url-${Date.now()}`,
        source: 'web_crawl',
        crawlConfig: { startUrl: 'not-a-url', maxDepth: 2, maxPages: 10 },
      },
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/gültige URL|startUrl/i);
  });

  test('web_crawl collection create, crawl-config patch, crawl trigger, and delete', async ({ request, page }) => {
    const cookie = await getCookieString(page);

    const headers = { Cookie: cookie };
    const stamp = `e2e-crawl-${Date.now()}`;

    // Create web_crawl collection
    const create = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: {
        name: stamp,
        source: 'web_crawl',
        crawlConfig: { startUrl: 'https://web.mentolder.de', maxDepth: 1, maxPages: 5 },
      },
      headers,
    });
    expect(create.status()).toBe(201);
    const collection = await create.json();
    const id = collection.id as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(collection.source).toBe('web_crawl');
    expect(collection.crawl_config?.startUrl).toBe('https://web.mentolder.de');

    // GET collection by ID
    const getRes = await request.get(`${BASE}/api/admin/knowledge/collections/${id}`, { headers });
    expect(getRes.status()).toBe(200);
    const got = await getRes.json();
    expect(got.source).toBe('web_crawl');

    // PATCH crawl-config — update maxPages
    const patch = await request.patch(`${BASE}/api/admin/knowledge/collections/${id}/crawl-config`, {
      data: { startUrl: 'https://web.mentolder.de', maxDepth: 1, maxPages: 3 },
      headers,
    });
    expect(patch.status()).toBe(200);
    const patched = await patch.json();
    expect(patched.ok).toBe(true);
    expect(patched.crawl_config.maxPages).toBe(3);

    // PATCH crawl-config rejects missing startUrl
    const patchBad = await request.patch(`${BASE}/api/admin/knowledge/collections/${id}/crawl-config`, {
      data: { maxDepth: 1 },
      headers,
    });
    expect(patchBad.status()).toBe(400);
    const patchBadBody = await patchBad.json();
    expect(patchBadBody.error).toMatch(/startUrl/i);

    // Trigger crawl — expect 202 Accepted
    const crawl = await request.post(`${BASE}/api/admin/knowledge/collections/${id}/crawl`, { headers });
    expect(crawl.status()).toBe(202);
    const crawlBody = await crawl.json();
    expect(crawlBody.collectionId).toBe(id);

    // GET crawl status — running should be boolean
    const status = await request.get(`${BASE}/api/admin/knowledge/collections/${id}/crawl`, { headers });
    expect(status.status()).toBe(200);
    const statusBody = await status.json();
    expect(typeof statusBody.running).toBe('boolean');

    // Cleanup
    const del = await request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, { headers });
    expect([204, 404]).toContain(del.status());
  });

  test('PATCH crawl-config rejects invalid URL', async ({ request, page }) => {
    const cookie = await getCookieString(page);


    // First create a web_crawl collection to patch
    const create = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: {
        name: `e2e-patch-url-${Date.now()}`,
        source: 'web_crawl',
        crawlConfig: { startUrl: 'https://web.mentolder.de', maxDepth: 1, maxPages: 5 },
      },
      headers: { Cookie: cookie },
    });
    const { id } = await create.json();

    const res = await request.patch(`${BASE}/api/admin/knowledge/collections/${id}/crawl-config`, {
      data: { startUrl: 'not-a-valid-url' },
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/gültige URL/i);

    // Cleanup
    await request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, { headers: { Cookie: cookie } });
  });

  test('PATCH crawl-config rejects non-web_crawl collections', async ({ request, page }) => {
    const cookie = await getCookieString(page);


    // Create a custom collection (not web_crawl)
    const create = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: { name: `e2e-custom-patch-${Date.now()}`, source: 'custom' },
      headers: { Cookie: cookie },
    });
    const { id } = await create.json();

    const res = await request.patch(`${BASE}/api/admin/knowledge/collections/${id}/crawl-config`, {
      data: { startUrl: 'https://web.mentolder.de' },
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/web_crawl/i);

    await request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, { headers: { Cookie: cookie } });
  });

  test('POST crawl returns 400 for non-web_crawl collection', async ({ request, page }) => {
    const cookie = await getCookieString(page);


    const create = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: { name: `e2e-crawl-source-${Date.now()}`, source: 'custom' },
      headers: { Cookie: cookie },
    });
    const { id } = await create.json();

    const res = await request.post(`${BASE}/api/admin/knowledge/collections/${id}/crawl`, {
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/web_crawl/i);

    await request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, { headers: { Cookie: cookie } });
  });
});

// ── Crawl button progress UX ─────────────────────────────────────────────────
//
// These tests verify that clicking "Crawl starten" gives persistent visual
// feedback while the crawl runs in the background — not just a one-shot alert.
// Both tests use page.route() to mock the crawl endpoint for determinism.

test.describe('Wissensquellen — Crawl button progress UX', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertWissensquellenReachable(request, testInfo);
  });
  test.setTimeout(60_000);

  test('button transitions to "Läuft…" + stays disabled after POST 202', async ({ page }) => {
    const cookie = await getCookieString(page);


    const stamp = `e2e-crawl-ux-${Date.now()}`;
    const create = await page.request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: {
        name: stamp,
        source: 'web_crawl',
        crawlConfig: { startUrl: 'https://web.mentolder.de', maxDepth: 1, maxPages: 1 },
      },
      headers: { Cookie: cookie },
    });
    expect(create.status()).toBe(201);
    const { id } = await create.json();

    // Mock: POST → 202, GET → running: true (crawl is still going)
    await page.route(`**/api/admin/knowledge/collections/${id}/crawl`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Crawl gestartet', collectionId: id }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ running: true }),
        });
      }
    });

    await page.goto(`${BASE}/admin/wissensquellen`);
    const crawlBtn = page.locator(`[data-crawl="${id}"]`);
    await expect(crawlBtn).toBeVisible();
    await crawlBtn.click();

    // After the mocked 202, the button must show a persistent running indicator
    // instead of resetting to "Crawl starten".
    await expect(crawlBtn).toHaveText('Läuft…', { timeout: 5_000 });
    await expect(crawlBtn).toBeDisabled();

    await page.request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, {
      headers: { Cookie: cookie },
    });
  });

  test('button resets to "Crawl starten" when GET returns running: false', async ({ page }) => {
    const cookie = await getCookieString(page);


    const stamp = `e2e-crawl-reset-${Date.now()}`;
    const create = await page.request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: {
        name: stamp,
        source: 'web_crawl',
        crawlConfig: { startUrl: 'https://web.mentolder.de', maxDepth: 1, maxPages: 1 },
      },
      headers: { Cookie: cookie },
    });
    expect(create.status()).toBe(201);
    const { id } = await create.json();

    // Mock: POST → 202, GET → running: false (crawl already done)
    await page.route(`**/api/admin/knowledge/collections/${id}/crawl`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Crawl gestartet', collectionId: id }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ running: false }),
        });
      }
    });

    await page.goto(`${BASE}/admin/wissensquellen`);
    const crawlBtn = page.locator(`[data-crawl="${id}"]`);
    await expect(crawlBtn).toBeVisible();
    await crawlBtn.click();

    // Once the first poll sees running: false the button must re-enable.
    await expect(crawlBtn).toHaveText('Crawl starten', { timeout: 15_000 });
    await expect(crawlBtn).toBeEnabled();

    await page.request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, {
      headers: { Cookie: cookie },
    });
  });

  test('button shows "Läuft…" immediately when crawl already running (409)', async ({ page }) => {
    const cookie = await getCookieString(page);


    const stamp = `e2e-crawl-409-${Date.now()}`;
    const create = await page.request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: {
        name: stamp,
        source: 'web_crawl',
        crawlConfig: { startUrl: 'https://web.mentolder.de', maxDepth: 1, maxPages: 1 },
      },
      headers: { Cookie: cookie },
    });
    expect(create.status()).toBe(201);
    const { id } = await create.json();

    // Mock: POST → 409 (already running), GET → running: true
    await page.route(`**/api/admin/knowledge/collections/${id}/crawl`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Crawl läuft bereits für diese Sammlung' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ running: true }),
        });
      }
    });

    await page.goto(`${BASE}/admin/wissensquellen`);
    const crawlBtn = page.locator(`[data-crawl="${id}"]`);
    await expect(crawlBtn).toBeVisible();
    await crawlBtn.click();

    // 409 means it's already running — button should show "Läuft…" not an alert.
    await expect(crawlBtn).toHaveText('Läuft…', { timeout: 5_000 });
    await expect(crawlBtn).toBeDisabled();

    await page.request.delete(`${BASE}/api/admin/knowledge/collections/${id}`, {
      headers: { Cookie: cookie },
    });
  });
});

// ── Web crawl source: UI creation via modal ─────────────────────────────────

test.describe('Wissensquellen admin — web_crawl UI', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertWissensquellenReachable(request, testInfo);
  });
  test.setTimeout(120_000);

  test('create web crawl collection via + Web-Quelle button', async ({ page }) => {
    const stamp = `e2e-webcrawl-${Date.now()}`;
    const wPage = new WissensquellenPage(page);
    await loginAsAdmin(page);
    const response = await wPage.createWebCrawlCollection(stamp, 'https://web.mentolder.de');
    expect(response.status()).toBe(201);
    const created = await response.json();

    await wPage.goto();
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('a[href*="mentolder"]')).toBeVisible();

    await wPage.deleteCollectionRow(stamp, created.id);
    await expect(row).not.toBeVisible({ timeout: 30_000 });
  });
});
