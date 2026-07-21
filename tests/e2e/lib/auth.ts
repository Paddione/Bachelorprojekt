import type { Page, APIRequestContext } from '@playwright/test';

export function getAdminCredentials(): { user: string; pass: string } {
  const isKorczewski = (process.env.WEBSITE_URL ?? '').includes('korczewski.de');
  const user = isKorczewski
    ? (process.env.TEST_ADMIN_USER ?? process.env.E2E_ADMIN_USER ?? 'test-admin')
    : (process.env.E2E_ADMIN_USER ?? 'paddione');
  const pass = isKorczewski
    ? (process.env.TEST_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASS ?? '')
    : (process.env.E2E_ADMIN_PASS ?? '');
  return { user, pass };
}

export function getBaseUrl(): string {
  return (process.env.WEBSITE_URL ?? 'http://localhost:4321').replace(/\/$/, '');
}

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function loginViaE2E(
  page: Page,
  baseUrl: string,
  user: string,
  returnTo = '/admin',
): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/api/auth/e2e-login?username=${encodeURIComponent(user)}&returnTo=${encodeURIComponent(returnTo)}`;

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });

  const escaped = returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.waitForURL(new RegExp(escaped), { timeout: 30_000 });
}

export async function loginAsAdmin(page: Page, returnTo = '/admin'): Promise<void> {
  const { user } = getAdminCredentials();
  await loginViaE2E(page, getBaseUrl(), user, returnTo);
}

export async function verifySession(
  request: APIRequestContext,
  baseUrl: string,
): Promise<{ authenticated: boolean; username?: string }> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const res = await request.get(`${cleanBase}/api/auth/me`);
  if (!res.ok()) {
    return { authenticated: false };
  }
  return res.json() as Promise<{ authenticated: boolean; username?: string }>;
}
