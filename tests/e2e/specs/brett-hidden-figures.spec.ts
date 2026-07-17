import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Coverage-Lücke (Gap-Analyse dev-flow-e2e): E9 "verdecktes Arbeiten"
// (figure_hide_set) ist als SICHERHEITSKRITISCH dokumentiert
// (brett/src/server/hidden-filter.ts: "hidden-Figurendaten dürfen einen
// Nicht-Leiter NIE erreichen — weder im Snapshot noch als Broadcast"),
// war aber bislang ungetestet. Diese Datei prüft den Server-seitigen
// Rollen-Filter end-to-end: ein Beobachter darf eine vom Leiter versteckte
// Figur weder im Broadcast noch im Join-Snapshot sehen.

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett hidden figures (E9 — verdecktes Arbeiten)', () => {
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

  test('a beobachter never receives a leiter-hidden figure — neither via broadcast nor join snapshot', async ({ browser }) => {
    const room = `e2e-hidden-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const beobCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-hidden-e2e', 'Leiter');
    await loginAs(beobCtx, 'beob-hidden-e2e', 'Beobachter');

    const leiter = await leiterCtx.newPage();
    const beob = await beobCtx.newPage();

    try {
      // ── Leiter erstellt Session, beansprucht die leiter-Rolle ──────────────
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-hidden-e2e', role: 'leiter' });

      // Seeded figure des Leiters als Ziel verwenden.
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const figureId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      // ── Beobachter tritt bei, BEVOR die Figur versteckt wird ───────────────
      await beob.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(beob);
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'beob-hidden-e2e', role: 'beobachter' });
      await beob.waitForTimeout(300);
      await beob.waitForFunction(
        (id) => (window as any).STATE?.figures?.some((f: any) => f.id === id),
        figureId,
        { timeout: 10000 }
      );

      // ── Leiter versteckt die Figur → Beobachter muss sie als 'delete' sehen ─
      await sendWs(leiter, { type: 'figure_hide_set', figureId, hidden: true });
      await beob.waitForFunction(
        (id) => !(window as any).STATE?.figures?.some((f: any) => f.id === id),
        figureId,
        { timeout: 10000 }
      );

      // Leiter behält die volle (halbtransparente) Sicht auf die Figur.
      const leiterStillSeesIt: boolean = await leiter.evaluate(
        (id) => (window as any).STATE.figures.some((f: any) => f.id === id),
        figureId
      );
      expect(leiterStillSeesIt, 'the leiter must still see the hidden figure').toBe(true);

      // ── Neuer Beobachter joint NACH dem Verstecken → Join-Snapshot darf die
      //    Figur ebenfalls nicht enthalten (Snapshot-Filter, nicht nur Broadcast).
      const latecomerCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      await loginAs(latecomerCtx, 'latecomer-hidden-e2e', 'Spätzugang');
      const latecomer = await latecomerCtx.newPage();
      try {
        await latecomer.goto(`${BRETT_URL}?room=${room}`);
        await waitForBoard(latecomer);
        await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'latecomer-hidden-e2e', role: 'beobachter' });
        await latecomer.waitForTimeout(1000);

        const latecomerSeesHidden: boolean = await latecomer.evaluate(
          (id) => (window as any).STATE?.figures?.some((f: any) => f.id === id) ?? false,
          figureId
        );
        expect(latecomerSeesHidden, 'a fresh join snapshot must not leak hidden figure data to a non-leiter').toBe(false);
      } finally {
        await latecomerCtx.close();
      }

      // ── Leiter zeigt die Figur wieder → Beobachter erhält sie erneut ────────
      await sendWs(leiter, { type: 'figure_hide_set', figureId, hidden: false });
      await beob.waitForFunction(
        (id) => (window as any).STATE?.figures?.some((f: any) => f.id === id),
        figureId,
        { timeout: 10000 }
      );
    } finally {
      await leiterCtx.close();
      await beobCtx.close();
    }
  });
});
