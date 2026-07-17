import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Coverage-Lücke (Gap-Analyse dev-flow-e2e, Folge-Runde): admin_spotlight_set,
// admin_dim_set, admin_freeze_set (Präsentations-Moderation, T000471) waren
// bisher ungetestet.

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett moderation (spotlight/dim/freeze)', () => {
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

  test('spotlight, dim and freeze broadcast moderation_state and can be cleared', async ({ browser }) => {
    const room = `e2e-moderation-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-mod-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-mod-e2e', role: 'leiter' });
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const figureId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      await captureMessages(leiter, ['moderation_state']);

      // ── Spotlight setzen und wieder löschen (figureId: null) ────────────────
      await sendWs(leiter, { type: 'admin_spotlight_set', figureId });
      await sendWs(leiter, { type: 'admin_spotlight_set', figureId: null });

      // ── Dim setzen und wieder löschen ────────────────────────────────────────
      await sendWs(leiter, { type: 'admin_dim_set', figureId });
      await sendWs(leiter, { type: 'admin_dim_set', figureId: null });

      // ── Freeze umschalten ────────────────────────────────────────────────────
      await sendWs(leiter, { type: 'admin_freeze_set', frozen: true });
      await sendWs(leiter, { type: 'admin_freeze_set', frozen: false });

      await leiter.waitForTimeout(500);
      const events = await getCaptured(leiter);
      expect(events.length, 'six moderation_state broadcasts expected').toBe(6);

      expect(events[0].spotlight).toBe(figureId);
      expect(events[1].spotlight).toBeNull();
      expect(events[2].dim).toBe(figureId);
      expect(events[3].dim).toBeNull();
      expect(events[4].freeze).toBe(true);
      expect(events[5].freeze).toBe(false);
    } finally {
      await ctx.close();
    }
  });

  test('admin_spotlight_set rejects an unknown figureId', async ({ browser }) => {
    const room = `e2e-moderation-invalid-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-mod-invalid-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-mod-invalid-e2e', role: 'leiter' });

      await captureMessages(leiter, ['error']);
      await sendWs(leiter, { type: 'admin_spotlight_set', figureId: 'does-not-exist' });
      await leiter.waitForTimeout(500);

      const errors = await getCaptured(leiter);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].reason).toBe('not-found');
    } finally {
      await ctx.close();
    }
  });
});
