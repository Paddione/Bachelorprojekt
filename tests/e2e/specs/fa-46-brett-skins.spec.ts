import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = (process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost')
).replace(/\/$/, '');

const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

// Read BRETT_OIDC_SECRET from environments/.secrets/mentolder.yaml (gitignored).
// This is the x-e2e-secret bypass for requireAdmin — avoids needing a live
// express-session cookie for API-level tests.
function readBrettOidcSecret(): string {
  const secretsPath = path.join(__dirname, '..', '..', '..', 'environments', '.secrets', 'mentolder.yaml');
  try {
    if (fs.existsSync(secretsPath)) {
      const content = fs.readFileSync(secretsPath, 'utf8');
      const match = content.match(/^BRETT_OIDC_SECRET:\s*["']?([^"'\r\n]+)["']?/m);
      if (match) return match[1].trim();
    }
  } catch {}
  return '';
}

const E2E_SECRET = readBrettOidcSecret();

function hasAuthState(): boolean {
  if (!fs.existsSync(BRETT_STATE_FILE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_STATE_FILE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch {
    return false;
  }
}

// Helper to generate a valid synthetic GLB containing a specified node name
function makeGlb(jsonObj: any): Buffer {
  const json = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const totalLen = 12 + 8 + jsonChunk.length;
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546C67, 0); // magic
  buf.writeUInt32LE(2, 4); // version
  buf.writeUInt32LE(totalLen, 8);
  buf.writeUInt32LE(jsonChunk.length, 12);
  buf.writeUInt32LE(0x4E4F534A, 16); // JSON type
  jsonChunk.copy(buf, 20);
  return buf;
}

// All tests in this suite require the auth state and admin access.
test.describe('FA-46: Brett Character Skins Management', () => {
  test.beforeEach(async () => {
    test.skip(!hasAuthState(), 'No authenticated session available (skip during offline / non-auth runs)');
    test.skip(!E2E_SECRET, 'BRETT_OIDC_SECRET not available — skipping admin API tests');
  });

  test('T1: GET /api/skins returns skin list including default mannequin', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/api/skins`);
    expect(res.status()).toBe(200);
    const skins = await res.json();
    expect(Array.isArray(skins)).toBe(true);
    const defaultSkin = skins.find((s: any) => s.id === 'default');
    expect(defaultSkin).toBeDefined();
    expect(defaultSkin.name).toBe('Mannequin');
  });

  test('T2: API character skin upload and delete lifecycle', async ({ request }) => {
    const testSkinName = `E2E Test Skin ${Date.now()}`;
    const glbBuffer = makeGlb({
      nodes: [{ name: 'mixamorigHips' }],
      animations: [{ name: 'idle' }],
    });

    // 1. Upload valid skin (using x-e2e-secret to satisfy requireAdmin)
    const uploadRes = await request.post(`${BRETT_URL}/api/skins/upload`, {
      headers: { 'x-e2e-secret': E2E_SECRET },
      multipart: {
        name: testSkinName,
        glb: {
          name: 'test-skin.glb',
          mimeType: 'model/gltf-binary',
          buffer: glbBuffer,
        }
      }
    });
    expect(uploadRes.status()).toBe(201);
    const uploaded = await uploadRes.json();
    expect(uploaded.name).toBe(testSkinName);
    expect(uploaded.id).toBeDefined();
    const skinId = uploaded.id;

    // 2. Verify it is listed in the catalog
    const catalogRes = await request.get(`${BRETT_URL}/api/skins`);
    expect(catalogRes.status()).toBe(200);
    const skins = await catalogRes.json();
    const found = skins.find((s: any) => s.id === skinId);
    expect(found).toBeDefined();
    expect(found.name).toBe(testSkinName);

    // 3. Delete the skin
    const delRes = await request.delete(`${BRETT_URL}/api/skins/${skinId}`, {
      headers: { 'x-e2e-secret': E2E_SECRET },
    });
    expect(delRes.status()).toBe(204);

    // 4. Verify it is gone from the catalog
    const catalogRes2 = await request.get(`${BRETT_URL}/api/skins`);
    expect(catalogRes2.status()).toBe(200);
    const skins2 = await catalogRes2.json();
    const found2 = skins2.find((s: any) => s.id === skinId);
    expect(found2).toBeUndefined();
  });

  test('T3: Upload rejects invalid name or GLB structure', async ({ request }) => {
    // Missing name
    const glbBuffer = makeGlb({
      nodes: [{ name: 'mixamorigHips' }],
    });
    const resNoName = await request.post(`${BRETT_URL}/api/skins/upload`, {
      headers: { 'x-e2e-secret': E2E_SECRET },
      multipart: {
        glb: {
          name: 'test-skin.glb',
          mimeType: 'model/gltf-binary',
          buffer: glbBuffer,
        }
      }
    });
    expect(resNoName.status()).toBe(400);

    // Invalid GLB structure (no mixamorigHips bone)
    const badGlbBuffer = makeGlb({
      nodes: [{ name: 'invalidBone' }],
    });
    const resBadGlb = await request.post(`${BRETT_URL}/api/skins/upload`, {
      headers: { 'x-e2e-secret': E2E_SECRET },
      multipart: {
        name: 'Invalid Skin',
        glb: {
          name: 'bad-skin.glb',
          mimeType: 'model/gltf-binary',
          buffer: badGlbBuffer,
        }
      }
    });
    expect(resBadGlb.status()).toBe(400);
    const err = await resBadGlb.json();
    expect(err.error).toContain('mixamorigHips');
  });

  test('T4: Cannot delete default skin', async ({ request }) => {
    const res = await request.delete(`${BRETT_URL}/api/skins/default`, {
      headers: { 'x-e2e-secret': E2E_SECRET },
    });
    expect(res.status()).toBe(400);
  });

  test('T5: Admin UI skins overlay features (Upload & Delete)', async ({ browser }) => {
    // Start with the authenticated storageState which should include connect.sid
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_STATE_FILE,
    });
    const page = await ctx.newPage();

    // If the session expired, re-establish via the API request context
    const meResp = await page.request.get(`${BRETT_URL}/auth/me`);
    const me = await meResp.json().catch(() => ({ isAdmin: false }));
    if (!me.isAdmin) {
      // Re-establish admin session using the bypass
      await page.request.post(`${BRETT_URL}/auth/e2e-login`, {
        headers: { 'x-e2e-secret': E2E_SECRET },
      });
    }

    // Navigate to Brett page
    await page.goto(`${BRETT_URL}?room=e2e-skins-ui-${Date.now()}`, { waitUntil: 'networkidle' });

    // The admin tab should now be visible (session is admin)
    const adminTab = page.locator('#ap-tab');
    await expect(adminTab).toBeVisible({ timeout: 10_000 });
    await adminTab.click();

    // Click "Charakter-Skins" action button
    const skinsActionBtn = page.locator('#ap-panel button[data-action="skins"]');
    await expect(skinsActionBtn).toBeVisible();
    await skinsActionBtn.click();

    // Verify skins overlay is visible
    const overlay = page.locator('#ap-skins-overlay');
    await expect(overlay).toBeVisible();

    // Verify the list has "Mannequin" skin
    await expect(overlay.locator('#ap-skins-list')).toContainText('Mannequin');

    // Perform upload via form
    const uiTestSkinName = `UI Skin ${Date.now()}`;
    const glbBuffer = makeGlb({
      nodes: [{ name: 'mixamorigHips' }],
      animations: [{ name: 'run' }],
    });

    await overlay.locator('input[name="name"]').fill(uiTestSkinName);
    await overlay.locator('input[name="glb"]').setInputFiles({
      name: 'ui-test.glb',
      mimeType: 'model/gltf-binary',
      buffer: glbBuffer,
    });

    // Submit form
    await overlay.locator('#ap-skin-upload-form button[type="submit"]').click();

    // Verify success message in status
    const statusEl = overlay.locator('#ap-skin-status');
    await expect(statusEl).toContainText('hochgeladen', { timeout: 10_000 });

    // Verify it is listed in the cards list
    const skinCard = overlay.locator('.ap-skin-card', { hasText: uiTestSkinName });
    await expect(skinCard).toBeVisible();

    // Hook dialog handler to auto-confirm deletion confirmation prompt
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('löschen');
      await dialog.accept();
    });

    // Delete the uploaded skin via UI
    await skinCard.locator('.ap-skin-delete').click();

    // Verify the skin card is removed
    await expect(skinCard).not.toBeVisible({ timeout: 10_000 });

    // Close overlay
    await overlay.locator('button[data-action="skins-close"]').click();
    await expect(overlay).not.toBeVisible();

    await ctx.close();
  });
});

