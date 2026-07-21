import { assertAuthenticatedReachable } from './health-assertions';

export const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
export const isKorczewski = BASE.includes('korczewski.de');
export const ADMIN_USER = isKorczewski
  ? (process.env.TEST_ADMIN_USER ?? 'test-admin')
  : (process.env.E2E_ADMIN_USER ?? 'paddione');
export const ADMIN_PASS = isKorczewski
  ? (process.env.TEST_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASS)
  : process.env.E2E_ADMIN_PASS;

export async function loginAsAdmin(page: import('@playwright/test').Page) {
  const CRON_SECRET = process.env.CRON_SECRET ?? '';
  if (!CRON_SECRET) throw new Error('CRON_SECRET unset — Wissensquellen login requires CRON_SECRET');
  const token = encodeURIComponent(CRON_SECRET);
  await page.goto(
    `${BASE}/api/auth/e2e-login?username=${encodeURIComponent(ADMIN_USER)}&returnTo=${encodeURIComponent('/admin/wissensquellen')}&token=${token}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForURL(/\/admin\/wissensquellen/, { timeout: 60_000 });
}

export async function getCookieString(page: import('@playwright/test').Page): Promise<string> {
  await loginAsAdmin(page);
  return (await page.context().cookies())
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

export async function assertWissensquellenReachable(request: any, testInfo: any) {
  await assertAuthenticatedReachable(
    request,
    `${BASE}/admin/wissensquellen`,
    { acceptableStatuses: [200, 302, 401], label: 'admin wissensquellen' },
    testInfo
  );
}

export class WissensquellenPage {
  constructor(public page: import('@playwright/test').Page) {}

  async goto() {
    await this.page.goto(`${BASE}/admin/wissensquellen`);
  }

  async createCustomCollection(name: string) {
    await this.page.getByRole('button', { name: '+ Neue Wissensquelle' }).click();
    await this.page.getByLabel('Name').fill(name);
    const [response] = await Promise.all([
      this.page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/documents'),
      ),
      this.page.getByRole('button', { name: 'Anlegen' }).click(),
    ]);
    return response;
  }

  async createWebCrawlCollection(name: string, url: string) {
    await this.page.getByRole('button', { name: '+ Web-Quelle' }).click();
    await this.page.getByLabel('Name').fill(name);
    await this.page.getByLabel(/Start-URL/i).fill(url);
    const [response] = await Promise.all([
      this.page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/documents'),
      ),
      this.page.getByRole('button', { name: 'Anlegen' }).click(),
    ]);
    return response;
  }

  async deleteCollectionRow(name: string, id: string) {
    const row = this.page.getByRole('row', { name: new RegExp(name) });
    const deleteResponse = this.page.waitForResponse(r =>
      r.url().includes(`/api/admin/knowledge/collections/${id}`) &&
      r.request().method() === 'DELETE',
    );
    this.page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Löschen' }).click();
    await deleteResponse;
  }
}
