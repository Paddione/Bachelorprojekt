import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const isKorczewski = BASE.includes('korczewski.de');
const ADMIN_USER = isKorczewski
  ? (process.env.TEST_ADMIN_USER ?? 'test-admin')
  : (process.env.E2E_ADMIN_USER ?? 'paddione');
const ADMIN_PASS = isKorczewski
  ? (process.env.TEST_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASS)
  : process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/wissensquellen`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/wissensquellen/, { timeout: 20_000 });
}

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
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/wissensquellen`,
      { acceptableStatuses: [200, 302, 401], label: 'admin wissensquellen' },
      testInfo
    );
  });
  test.setTimeout(120_000);

  test('create custom collection (no paste content avoids embedding dependency)', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('button', { name: '+ Neue Wissensquelle' }).click();
    const stamp = `e2e-${Date.now()}`;
    await page.getByLabel('Name').fill(stamp);
    // Leave paste content empty — KnowledgeSourceModal skips embedBatch when
    // pasted.trim() is falsy, so onCreated fires without needing an embedding service.

    // Intercept the collection-creation API call to confirm success, then
    // navigate manually. We don't rely on detecting location.reload() inside the
    // Svelte component because Playwright's waitForNavigation doesn't reliably
    // catch in-component reload calls on SSR-hydrated Astro pages.
    const [response] = await Promise.all([
      page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/documents'),
      ),
      page.getByRole('button', { name: 'Anlegen' }).click(),
    ]);
    expect(response.status()).toBe(201);
    const created = await response.json();

    // Navigate explicitly so the row is guaranteed to be in the rendered HTML.
    await page.goto(`${BASE}/admin/wissensquellen`);
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Cleanup via the Löschen button (JS confirm dialog).
    const deleteResponse = page.waitForResponse(r =>
      r.url().includes(`/api/admin/knowledge/collections/${created.id}`) &&
      r.request().method() === 'DELETE',
    );
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Löschen' }).click();
    await deleteResponse;
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });
});

// ── Web crawl source: API validation + lifecycle ─────────────────────────────

test.describe('Wissensquellen — web_crawl collection API', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/wissensquellen`,
      { acceptableStatuses: [200, 302, 401], label: 'admin wissensquellen' },
      testInfo
    );
  });
  test.setTimeout(120_000);

  async function getAuthCookie(request: import('@playwright/test').APIRequestContext) {
    const loginPage = await request.get(`${BASE}/api/auth/login?returnTo=/admin/wissensquellen`);
    return loginPage.headers()['set-cookie'] ?? '';
  }

  test('POST /api/admin/knowledge/collections rejects web_crawl without startUrl', async ({ request, page }) => {
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    const res = await request.post(`${BASE}/api/admin/knowledge/collections`, {
      data: { name: `e2e-no-url-${Date.now()}`, source: 'web_crawl' },
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/startUrl/);
  });

  test('POST /api/admin/knowledge/collections rejects invalid startUrl', async ({ request, page }) => {
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
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
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/wissensquellen`,
      { acceptableStatuses: [200, 302, 401], label: 'admin wissensquellen' },
      testInfo
    );
  });
  test.setTimeout(60_000);

  test('button transitions to "Läuft…" + stays disabled after POST 202', async ({ page }) => {
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await loginAsAdmin(page);
    const cookie = (await page.context().cookies())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

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
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/wissensquellen`,
      { acceptableStatuses: [200, 302, 401], label: 'admin wissensquellen' },
      testInfo
    );
  });
  test.setTimeout(120_000);

  test('create web crawl collection via + Web-Quelle button', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('button', { name: '+ Web-Quelle' }).click();

    const stamp = `e2e-webcrawl-${Date.now()}`;
    await page.getByLabel('Name').fill(stamp);
    await page.getByLabel(/Start-URL/i).fill('https://web.mentolder.de');

    // Same intercept pattern as the custom-source test — wait for the API
    // response then navigate explicitly rather than detecting location.reload().
    const [response] = await Promise.all([
      page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/documents'),
      ),
      page.getByRole('button', { name: 'Anlegen' }).click(),
    ]);
    expect(response.status()).toBe(201);
    const created = await response.json();
    await page.goto(`${BASE}/admin/wissensquellen`);

    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Verify Start-URL is shown in the table
    await expect(row.locator('a[href*="mentolder"]')).toBeVisible();

    // Cleanup via UI (confirm dialog + wait for DELETE response)
    const deleteResponse = page.waitForResponse(r =>
      r.url().includes(`/api/admin/knowledge/collections/${created.id}`) &&
      r.request().method() === 'DELETE',
    );
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Löschen' }).click();
    await deleteResponse;
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });
});
