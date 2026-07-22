// tests/e2e/specs/fa-m3-onboarding-flow.spec.ts
// M3 — Geführtes Onboarding: portal-onboarding-sequence trigger + mark-step API

import { test, expect, type Page } from '@playwright/test';
import { loginViaE2E } from '../lib/auth';

const BASE        = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const GEKKO_USER  = process.env.E2E_GEKKO_USER ?? 'gekko';
const GEKKO_PASS  = process.env.E2E_GEKKO_PASS ?? '';

async function loginAsGekko(page: Page): Promise<void> {
  await loginViaE2E(page, BASE, GEKKO_USER, '/portal');
}

// ── M3-01: Portal nudge endpoint returns onboarding nudge after first login ──

test.describe('M3 Onboarding Flow', () => {
  test('M3-01: /api/assistant/nudges returns portal-onboarding-sequence nudge for logged-in user', async ({ page }) => {
    await loginAsGekko(page);

    // First: ensure portal-first-login has fired by visiting /portal
    await page.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText('500');

    // Fetch nudges for the portal profile
    const res = await page.request.get(`${BASE}/api/assistant/nudges?profile=portal`);
    expect(res.ok()).toBe(true);

    const body = await res.json() as { nudges?: Array<{ triggerId: string }> };
    const nudges = body.nudges ?? [];

    // After first login is recorded, the onboarding-sequence trigger should fire
    // for users who haven't completed any step yet.
    // Either portal-first-login OR portal-onboarding-sequence should be present
    // (first-login fires once, then sequence takes over).
    const hasOnboarding = nudges.some(
      n => n.triggerId === 'portal-first-login' || n.triggerId === 'portal-onboarding-sequence'
    );
    expect(hasOnboarding).toBe(true);
  });

  // ── M3-02: Primary action on first onboarding nudge is non-empty ────────────

  test('M3-02: First onboarding nudge has a non-empty primaryAction kickoff', async ({ page }) => {
    await loginAsGekko(page);
    await page.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded' });

    const res = await page.request.get(`${BASE}/api/assistant/nudges?profile=portal`);
    expect(res.ok()).toBe(true);

    const body = await res.json() as {
      nudges?: Array<{
        triggerId: string;
        primaryAction?: { label: string; kickoff: string };
      }>;
    };
    const nudges = body.nudges ?? [];

    const onboardingNudge = nudges.find(
      n => n.triggerId === 'portal-first-login' || n.triggerId === 'portal-onboarding-sequence'
    );
    expect(onboardingNudge).toBeDefined();
    expect(onboardingNudge?.primaryAction?.kickoff).toBeTruthy();
    expect((onboardingNudge?.primaryAction?.kickoff ?? '').length).toBeGreaterThan(0);
  });

  // ── M3-05: mark-step API persists an onboarding step ────────────────────────

  test('M3-05: POST /api/portal/onboarding/mark-step persists step and returns ok', async ({ page }) => {
    await loginAsGekko(page);

    // Mark the sidekick-intro step as complete
    const res = await page.request.post(`${BASE}/api/portal/onboarding/mark-step`, {
      data: { stepId: 'sidekick-intro' },
    });
    expect(res.ok()).toBe(true);

    const body = await res.json() as { ok?: boolean };
    expect(body.ok).toBe(true);

    // After marking sidekick-intro, the sequence should advance to agent-guide-intro
    const nudgeRes = await page.request.get(`${BASE}/api/assistant/nudges?profile=portal`);
    expect(nudgeRes.ok()).toBe(true);

    const nudgeBody = await nudgeRes.json() as {
      nudges?: Array<{ triggerId: string; id: string }>;
    };
    const nudges = nudgeBody.nudges ?? [];
    const sequenceNudge = nudges.find(n => n.triggerId === 'portal-onboarding-sequence');

    // If the sequence is still active, it should now show agent-guide-intro (not sidekick-intro)
    if (sequenceNudge) {
      expect(sequenceNudge.id).not.toBe('portal-onboarding:sidekick-intro');
    }
  });

  // ── Auth guard: unauthenticated calls to mark-step return 401 ───────────────

  test('M3-auth: POST /api/portal/onboarding/mark-step → 401 when unauthenticated', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/portal/onboarding/mark-step`, {
      data: { stepId: 'sidekick-intro' },
    });
    expect(res.status()).toBe(401);
  });

  test('M3-validation: POST /api/portal/onboarding/mark-step → 400 when stepId missing', async ({ page }) => {
    await loginAsGekko(page);

    const res = await page.request.post(`${BASE}/api/portal/onboarding/mark-step`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
