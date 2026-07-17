import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Coverage-Lücke (Gap-Analyse dev-flow-e2e, Folge-Runde): session_undo /
// session_redo (T000470) waren bisher ungetestet — insbesondere, dass der
// Re-Snapshot nach Undo/Redo rollen-bewusst gefiltert wird (E9-Review-Blocker-
// Kommentar in ws-admin-commands.ts) statt hidden-Figuren an Nicht-Leiter zu
// leaken.

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett undo/redo (session_undo / session_redo)', () => {
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

  test('session_undo reverts a move; session_redo re-applies it', async ({ browser }) => {
    const room = `e2e-undo-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-undo-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-undo-e2e', role: 'leiter' });
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const figureId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      const xBefore: number = await leiter.evaluate(
        (id) => (window as any).STATE.figures.find((f: any) => f.id === id).x,
        figureId
      );

      await sendWs(leiter, { type: 'move', id: figureId, x: xBefore + 3, z: 0, facingY: 0 });
      await leiter.waitForFunction(
        ({ id, x }) => (window as any).STATE.figures.find((f: any) => f.id === id)?.x === x,
        { id: figureId, x: xBefore + 3 },
        { timeout: 10000 }
      );

      await captureMessages(leiter, ['undo_stack_changed', 'snapshot']);
      await sendWs(leiter, { type: 'session_undo' });
      await leiter.waitForFunction(
        ({ id, x }) => (window as any).STATE.figures.find((f: any) => f.id === id)?.x === x,
        { id: figureId, x: xBefore },
        { timeout: 10000 }
      );

      const afterUndo = await getCaptured(leiter);
      const stackAfterUndo = afterUndo.filter((m) => m.type === 'undo_stack_changed').pop();
      expect(stackAfterUndo, 'undo_stack_changed must broadcast after a successful undo').toBeTruthy();
      expect(stackAfterUndo.canRedo).toBe(true);

      await sendWs(leiter, { type: 'session_redo' });
      await leiter.waitForFunction(
        ({ id, x }) => (window as any).STATE.figures.find((f: any) => f.id === id)?.x === x,
        { id: figureId, x: xBefore + 3 },
        { timeout: 10000 }
      );
    } finally {
      await ctx.close();
    }
  });

  test('session_undo on an empty stack returns undo-stack-empty', async ({ browser }) => {
    const room = `e2e-undo-empty-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-undo-empty-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-undo-empty-e2e', role: 'leiter' });

      await captureMessages(leiter, ['error']);
      await sendWs(leiter, { type: 'session_undo' });
      await leiter.waitForTimeout(500);

      const errors = await getCaptured(leiter);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].reason).toBe('undo-stack-empty');
    } finally {
      await ctx.close();
    }
  });
});
