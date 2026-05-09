// tests/e2e/specs/brett-art.spec.ts
// Brett is SSO-gated (oauth2-proxy → Keycloak).
//
// Auth approach: the `korczewski-setup` project runs korczewski-auth-setup.spec.ts
// which does a real OIDC login and writes .auth/korczewski-brett.json.
// When TEST_ADMIN_PASSWORD is not set the setup writes an empty state and these
// tests fall back to asserting the redirect-to-Keycloak behaviour only.
//
// Art library availability: the art-library feature requires a brett image that
// exposes window.__ART_READY__ after bootArtLibrary() completes.  If the deployed
// image pre-dates this feature the tests skip gracefully.
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL        = (process.env.BRETT_URL ?? 'https://brett.korczewski.de').replace(/\/$/, '');
const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'korczewski-brett.json');

// Determine whether a valid auth state was produced by korczewski-auth-setup
function hasAuthState(): boolean {
  if (!fs.existsSync(BRETT_STATE_FILE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_STATE_FILE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch {
    return false;
  }
}

// Each authenticated test creates a context with the saved storageState so
// cookies are already present — no cookie-injection helpers needed.

test('Brett redirects unauthenticated users to Keycloak', async ({ browser }) => {
  // Use a fresh context (no auth state) to verify the redirect
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });
  if (hasAuthState()) {
    // When we have auth we can't meaningfully test the redirect on this URL
    // because the same user may already be signed in.  Skip gracefully.
    await ctx.close();
    test.skip();
    return;
  }
  await expect(page).toHaveURL(/auth\.|realms\/workspace/, { timeout: 15_000 });
  await ctx.close();
});

test('Brett loads art manifest and exposes character ids', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: BRETT_STATE_FILE,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BRETT_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    // Check if the deployed brett image supports the art library feature
    // (window.__ART_READY__ is set by bootArtLibrary() which was added in PR #622)
    const hasArtLibraryFeature = await page.evaluate(() => {
      const scriptText = document.querySelector('script:not([src])')?.innerHTML ?? '';
      return scriptText.includes('__ART_READY__') || scriptText.includes('bootArtLibrary');
    });
    if (!hasArtLibraryFeature) {
      test.skip(); // deployed image pre-dates art library — skip, not fail
      return;
    }

    await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 15_000 });
    const ids = await page.evaluate(() => Array.from((window as any).characterIds ?? []));
    expect(ids).toEqual(expect.arrayContaining(['figure-01', 'figure-02', 'figure-03', 'figure-04']));
  } finally {
    await ctx.close();
  }
});

test('Placing a figure creates a Sprite child in the figure mesh', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: BRETT_STATE_FILE,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BRETT_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    const hasArtLibraryFeature = await page.evaluate(() => {
      const scriptText = document.querySelector('script:not([src])')?.innerHTML ?? '';
      return scriptText.includes('__ART_READY__') || scriptText.includes('bootArtLibrary');
    });
    if (!hasArtLibraryFeature) {
      test.skip();
      return;
    }

    await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 15_000 });
    await page.click('button[data-type="figure-01"]');
    await page.evaluate(() => (window as any).addFigure('figure-01', '#9caa86', 0, 0, '', 1, 0, 'test-1'));
    const hasSprite = await page.evaluate(() => {
      const fig = (window as any).figures?.find((f: any) => f.id === 'test-1');
      return Boolean(fig?.mesh?.children?.some((c: any) => c.type === 'Sprite'));
    });
    expect(hasSprite).toBe(true);
  } finally {
    await ctx.close();
  }
});
