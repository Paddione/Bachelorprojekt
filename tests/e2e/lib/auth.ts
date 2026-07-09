// tests/e2e/lib/auth.ts
// Centralized Keycloak OIDC auth helpers shared across setup specs.

import type { Page, APIRequestContext } from '@playwright/test';

/**
 * Performs real Keycloak OIDC login via the website's /api/auth/login endpoint.
 * Returns after the post-auth redirect lands back on baseUrl.
 */
export async function loginViaKeycloak(
  page: Page,
  baseUrl: string,
  user: string,
  pass: string,
  returnTo = '/admin',
): Promise<void> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  await page.goto(`${cleanBase}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
    waitUntil: 'domcontentloaded',
  });

  // Wait for redirect to Keycloak realm login page
  await page.waitForURL(/realms\/workspace/, { timeout: 60_000 });

  await page.locator('#username').fill(user);
  await page.locator('#password').fill(pass);
  await page.locator('#kc-login').click();

  // Wait for post-auth redirect back to website
  const escapedBase = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.waitForURL(new RegExp(escapedBase), { timeout: 20_000 });
}

/**
 * Verifies the current session is active via /api/auth/me.
 * Returns the parsed JSON body.
 */
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
