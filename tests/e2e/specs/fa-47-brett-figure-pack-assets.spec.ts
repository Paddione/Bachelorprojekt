// tests/e2e/specs/fa-47-brett-figure-pack-assets.spec.ts
// Regression test for T000527: Brett figure-pack assets must be served in prod.
//
// Since the #1375 TS migration (vite root:'public' + multi-stage Dockerfile) the
// public/assets/ tree was no longer shipped into the served dist/client, so every
// figure-pack asset 404'd. This test asserts the served brett app exposes the
// placement_spec.json registry AND the individual asset PNGs (covering both the
// pre-existing assets and the T000522 additions: relieved/defiant/fearful +
// scarf/spectacles).
//
// Brett is SSO-gated (oauth2-proxy → Keycloak). Auth mirrors brett-art.spec.ts:
// korczewski-setup writes .auth/korczewski-brett.json via a real OIDC login. When
// no valid auth state exists the authenticated checks skip gracefully and only the
// redirect behaviour is asserted.
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL        = (process.env.BRETT_URL ?? 'https://brett.korczewski.de').replace(/\/$/, '');
const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'korczewski-brett.json');

// Pre-existing baseline asset + the T000522 additions — all must serve.
const EXPECT_FACES       = ['neutral', 'relieved', 'defiant', 'fearful'];
const EXPECT_ACCESSORIES = ['shawl', 'scarf', 'spectacles'];
const ASSET_PNGS = [
  'assets/figure-pack/faces/neutral.png',
  'assets/figure-pack/faces/relieved.png',
  'assets/figure-pack/faces/defiant.png',
  'assets/figure-pack/faces/fearful.png',
  'assets/figure-pack/accessories/scarf.png',
  'assets/figure-pack/accessories/spectacles.png',
];

function hasAuthState(): boolean {
  if (!fs.existsSync(BRETT_STATE_FILE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_STATE_FILE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch {
    return false;
  }
}

test.describe('FA-47: Brett figure-pack assets are served (T000527 / T000522)', () => {
  test('T1: Brett redirects unauthenticated users to Keycloak', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });
    if (hasAuthState()) {
      await ctx.close();
      test.skip();
      return;
    }
    await expect(page).toHaveURL(/auth\.|realms\/workspace/, { timeout: 60_000 });
    await ctx.close();
  });

  test('T2: placement_spec.json is served and registers the new faces/accessories', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    try {
      const res = await ctx.request.get(`${BRETT_URL}/assets/figure-pack/placement_spec.json`);
      expect(res.status(), 'placement_spec.json must be served (not 404)').toBe(200);
      const spec = await res.json();
      for (const f of EXPECT_FACES) {
        expect(spec.faces?.[f]?.file, `face ${f} registered`).toBe(`faces/${f}.png`);
      }
      for (const a of EXPECT_ACCESSORIES) {
        expect(spec.accessories?.[a]?.file, `accessory ${a} registered`).toBe(`accessories/${a}.png`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('T3: figure-pack PNGs are served (HTTP 200, image/png)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    try {
      for (const p of ASSET_PNGS) {
        const res = await ctx.request.get(`${BRETT_URL}/${p}`);
        expect(res.status(), `${p} should be served`).toBe(200);
        expect(res.headers()['content-type'] ?? '', `${p} content-type`).toContain('image/png');
      }
    } finally {
      await ctx.close();
    }
  });
});
