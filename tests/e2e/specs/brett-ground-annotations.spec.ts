import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Coverage-Lücke (Gap-Analyse dev-flow-e2e, Folge-Runde): Boden-Anker/Zonen
// (T000468, anchor_create/delete, zone_create/update/delete) und
// Beziehungs-/Spannungslinien (T000467, line_create/delete/line_type_set)
// waren bisher ungetestet — inklusive des leiter-exklusiven Gates für Linien
// (isAdmin allein reicht NICHT, die Rolle muss 'leiter' sein).

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett ground annotations (anchors/zones/lines)', () => {
  test.skip(!BRETT_OIDC_SECRET, 'BRETT_OIDC_SECRET required to mint distinct e2e identities');

  async function loginAs(context: BrowserContext, userId: string, name: string): Promise<void> {
    const res = await context.request.post(`${BRETT_URL}/auth/e2e-login`, {
      headers: { 'x-e2e-secret': BRETT_OIDC_SECRET, 'content-type': 'application/json' },
      data: { userId, name, isAdmin: true },
    });
    expect(res.ok(), `e2e-login for ${userId}`).toBeTruthy();
  }

  async function waitForBoard(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const ws = (window as any).__brettWS;
      return ws && ws.readyState === 1 && (window as any).STATE;
    }, { timeout: 15000 });
  }

  async function sendWs(page: Page, msg: any): Promise<void> {
    await page.evaluate((m) => (window as any).__brettWS.send(JSON.stringify(m)), msg);
  }

  async function captureMessages(page: Page, types: string[]): Promise<void> {
    await page.evaluate((watchedTypes) => {
      (window as any).__captured = [];
      (window as any).__brettWS.addEventListener('message', (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data);
          if (watchedTypes.includes(m.type)) (window as any).__captured.push(m);
        } catch {}
      });
    }, types);
  }

  async function getCaptured(page: Page): Promise<any[]> {
    return page.evaluate(() => (window as any).__captured ?? []);
  }

  test('anchor_create + anchor_delete broadcast anchor_added / anchor_removed', async ({ browser }) => {
    const room = `e2e-anchor-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-anchor-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-anchor-e2e', role: 'leiter' });

      await captureMessages(leiter, ['anchor_added', 'anchor_removed']);
      await sendWs(leiter, { type: 'anchor_create', anchor: { x: 1, z: 2, label: 'Ziel' } });
      await leiter.waitForTimeout(400);

      const added = (await getCaptured(leiter)).find((m) => m.type === 'anchor_added');
      expect(added, 'anchor_added must be broadcast').toBeTruthy();
      expect(added.anchor.x).toBe(1);
      expect(added.anchor.z).toBe(2);

      await sendWs(leiter, { type: 'anchor_delete', anchorId: added.anchor.id });
      await leiter.waitForTimeout(400);

      const removed = (await getCaptured(leiter)).find((m) => m.type === 'anchor_removed');
      expect(removed, 'anchor_removed must be broadcast').toBeTruthy();
      expect(removed.anchorId).toBe(added.anchor.id);
    } finally {
      await ctx.close();
    }
  });

  test('zone_create + zone_update + zone_delete round-trip', async ({ browser }) => {
    const room = `e2e-zone-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-zone-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-zone-e2e', role: 'leiter' });

      await captureMessages(leiter, ['zone_added', 'zone_updated', 'zone_removed']);
      await sendWs(leiter, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', width: 2, height: 2 } });
      await leiter.waitForTimeout(400);

      const added = (await getCaptured(leiter)).find((m) => m.type === 'zone_added');
      expect(added, 'zone_added must be broadcast').toBeTruthy();
      const zoneId = added.zone.id;

      await sendWs(leiter, { type: 'zone_update', zoneId, x: 5, z: 5 });
      await leiter.waitForTimeout(400);
      const updated = (await getCaptured(leiter)).find((m) => m.type === 'zone_updated');
      expect(updated.zone.x).toBe(5);
      expect(updated.zone.z).toBe(5);

      await sendWs(leiter, { type: 'zone_delete', zoneId });
      await leiter.waitForTimeout(400);
      const removed = (await getCaptured(leiter)).find((m) => m.type === 'zone_removed');
      expect(removed.zoneId).toBe(zoneId);
    } finally {
      await ctx.close();
    }
  });

  test('an isAdmin non-leiter cannot create a line (leiter-only, isAdmin claim alone is insufficient)', async ({ browser }) => {
    const room = `e2e-line-forbidden-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const stellvertreterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-line-e2e', 'Leiter');
    await loginAs(stellvertreterCtx, 'stellv-line-e2e', 'Stellvertreter');
    const leiter = await leiterCtx.newPage();
    const stellv = await stellvertreterCtx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-line-e2e', role: 'leiter' });
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const fromId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      await sendWs(leiter, { type: 'add', figure: { id: 'line-target-e2e', x: 3, z: 3, facingY: 0, label: 'Ziel', color: '#fff' } });
      await leiter.waitForTimeout(300);

      await stellv.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(stellv);
      // isAdmin:true, aber KEINE explizite leiter-Rolle → resolveRole liefert stellvertreter/beobachter.
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'stellv-line-e2e', role: 'stellvertreter' });
      await stellv.waitForTimeout(300);

      await captureMessages(stellv, ['error']);
      await sendWs(stellv, { type: 'line_create', fromId, toId: 'line-target-e2e', lineType: 'relationship' });
      await stellv.waitForTimeout(500);

      const errors = await getCaptured(stellv);
      expect(errors.length, 'line_create by a non-leiter must be rejected').toBeGreaterThan(0);
      expect(errors[0].reason).toBe('forbidden');
    } finally {
      await leiterCtx.close();
      await stellvertreterCtx.close();
    }
  });

  test('leiter creates, retypes and deletes a relationship line', async ({ browser }) => {
    const room = `e2e-line-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-line-ok-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-line-ok-e2e', role: 'leiter' });
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const fromId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);
      await sendWs(leiter, { type: 'add', figure: { id: 'line-ok-target-e2e', x: 3, z: 3, facingY: 0, label: 'Ziel', color: '#fff' } });
      await leiter.waitForTimeout(300);

      await captureMessages(leiter, ['line_created', 'line_type_changed', 'line_deleted']);
      await sendWs(leiter, { type: 'line_create', fromId, toId: 'line-ok-target-e2e', lineType: 'relationship' });
      await leiter.waitForTimeout(400);
      const created = (await getCaptured(leiter)).find((m) => m.type === 'line_created');
      expect(created, 'line_created must be broadcast').toBeTruthy();
      expect(created.line.lineType).toBe('relationship');

      await sendWs(leiter, { type: 'line_type_set', lineId: created.line.id, lineType: 'tension' });
      await leiter.waitForTimeout(400);
      const retyped = (await getCaptured(leiter)).find((m) => m.type === 'line_type_changed');
      expect(retyped.lineType).toBe('tension');

      await sendWs(leiter, { type: 'line_delete', lineId: created.line.id });
      await leiter.waitForTimeout(400);
      const deleted = (await getCaptured(leiter)).find((m) => m.type === 'line_deleted');
      expect(deleted.lineId).toBe(created.line.id);
    } finally {
      await ctx.close();
    }
  });
});
