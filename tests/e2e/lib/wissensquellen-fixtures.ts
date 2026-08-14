import { expect } from '@playwright/test';
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
    `${BASE}/api/auth/e2e-login?username=${encodeURIComponent(ADMIN_USER)}&returnTo=${encodeURIComponent('/admin/wissen')}&token=${token}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => window.location.pathname.includes('/admin/wissen'),
    { timeout: 60_000 },
  );
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
    `${BASE}/admin/wissen`,
    { acceptableStatuses: [200, 302, 401], label: 'admin wissen' },
    testInfo
  );
}

export class WissensquellenPage {
  constructor(public page: import('@playwright/test').Page) {}

  async goto(tab: 'einlesen' | 'sammlungen' = 'sammlungen') {
    await this.page.goto(`${BASE}/admin/wissen?_t=${Date.now()}`, { waitUntil: 'networkidle' });
    if (tab === 'sammlungen') {
      const sammlungenTab = this.page.getByRole('button', { name: /sammlungen/i });
      await expect(sammlungenTab).toBeVisible({ timeout: 15_000 });
      await sammlungenTab.click();
      await expect(sammlungenTab).toHaveClass(/active/, { timeout: 10_000 });
    }
  }

  async createCustomCollection(name: string) {
    await this.page.waitForLoadState('networkidle');
    const sammlungenTab = this.page.getByRole('button', { name: /sammlungen/i });
    if (await sammlungenTab.isVisible()) {
      await sammlungenTab.click();
    }
    const newBtn = this.page.getByRole('button', { name: /\+ Neue (Sammlung|Wissensquelle)/i });
    if (await newBtn.isVisible()) {
      await newBtn.click();
    }
    await this.page.evaluate(() => window.dispatchEvent(new CustomEvent('open-wissensquellen-modal')));
    const modal = this.page.locator('dialog[open]').first();
    await modal.getByLabel('Name').fill(name);
    const [response] = await Promise.all([
      this.page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/documents'),
      ),
      modal.getByRole('button', { name: 'Anlegen' }).click(),
    ]);
    return response;
  }

  async createWebCrawlCollection(name: string, url: string) {
    await this.page.waitForLoadState('networkidle');
    const einlesenTab = this.page.getByRole('button', { name: /einlesen/i });
    if (await einlesenTab.isVisible()) {
      await einlesenTab.click();
    }
    const newBtn = this.page.getByRole('button', { name: /\+ Web-Quelle/i });
    if (await newBtn.isVisible()) {
      await newBtn.click();
    }
    await this.page.evaluate(() => window.dispatchEvent(new CustomEvent('open-web-crawl-modal')));
    const modal = this.page.locator('dialog[open]').first();
    await modal.getByLabel('Name').fill(name);
    await modal.locator('input[type="url"]').fill(url);
    const [response] = await Promise.all([
      this.page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST',
      ),
      modal.getByRole('button', { name: 'Anlegen' }).click(),
    ]);
    return response;
  }

  async deleteCollectionRow(name: string, id?: string) {
    const sammlungenTab = this.page.getByRole('button', { name: /sammlungen/i });
    if (await sammlungenTab.isVisible()) {
      await sammlungenTab.click();
    }
    const row = this.page.getByRole('row', { name: new RegExp(name) });
    if (await row.isVisible()) {
      this.page.once('dialog', d => d.accept());
      const deletePromise = id
        ? this.page.waitForResponse(r => r.url().includes(`/api/admin/knowledge/collections/${id}`) && r.request().method() === 'DELETE').catch(() => null)
        : null;
      await row.getByRole('button', { name: 'Löschen' }).click();
      if (deletePromise) await deletePromise;
    }
  }
}
