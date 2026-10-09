// tests/e2e/specs/brett-replay.spec.ts
// T901676 p1 — Replay-Flag-Spec (dark-launch `replay`, T000472).
//
// Flag-sensitiv: liest `window.__brettFeatures['replay']` und assertet bei
// gesetztem Flag die Timeline-/Replay-UI (sichtbare Marker via data-testid,
// kein harter Selektor-Rat); bei abgeschaltetem Flag `test.skip` mit
// beobachteter URL im Grund. Fail-closed: kein Reachability-Guard — gegen
// ein totes Env geht die Suite rot (p3-Negativ-Probe), nie falsch-grün.
import { test, expect } from '@playwright/test';

const BRETT_URL = (process.env.BRETT_URL ?? 'http://brett.localhost').replace(/\/$/, '');

test.describe('Brett replay timeline (T901676)', { tag: ['@brett'] }, () => {
  test('replay flag exposes the timeline UI', async ({ page }) => {
    await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const flag: unknown = await page.evaluate(
      () => (window as any).__brettFeatures?.['replay'],
    );
    test.skip(
      flag !== true,
      `replay flag off (flag=${String(flag)}, url=${page.url()}) — dark-launch inactive`,
    );
    const room = `e2e-replay-${Date.now()}`;
    await page.goto(`${BRETT_URL}?replay=1&room=${room}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page.getByTestId('brett-timeline')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('timeline-play-pause')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('timeline-track')).toBeVisible({ timeout: 15_000 });
  });
});
