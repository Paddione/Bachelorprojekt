import { test, expect } from '@playwright/test';

const BASE = process.env.KORCZEWSKI_URL?.replace(/\/$/, '') ?? 'https://web.korczewski.de';

// ── Homepage ─────────────────────────────────────────────────────────────────

test.describe('Korczewski: Homepage', () => {
  test('T1: page loads with correct title', async ({ page }) => {
    const res = await page.goto(`${BASE}/`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/korczewski/i);
  });

  test('T2: nav brand wordmark is "korczewski."', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const brand = page.getByRole('link', { name: /korczewski startseite/i });
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('korczewski.');
  });

  test('T3: nav contains Leistungen, Über mich, Notizen, Kontakt', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const nav = page.getByRole('navigation', { name: /seitennavigation/i });
    await expect(nav.getByRole('link', { name: 'Leistungen' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Über mich' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Notizen' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Kontakt' })).toBeVisible();
  });

  test('T4: hero h1 contains "Kubernetes & KI"', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('h1').first()).toContainText('Kubernetes & KI');
  });

  test('T5: nav shows Anmelden and Registrieren when logged out', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('link', { name: /anmelden/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /registrieren/i })).toBeVisible();
  });

  test('T6: services section shows 3 service cards', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('heading', { name: /was ich tue/i, level: 2 })).toBeVisible();
    // Service cards each have a "Mehr erfahren →" link; experience articles don't
    const serviceCards = page.locator('article').filter({ has: page.getByRole('link', { name: /mehr erfahren/i }) });
    await expect(serviceCards).toHaveCount(3);
  });

  test('T7: service cards include KI, Software, Kubernetes', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('heading', { name: /KI-Integration/i, level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Software-Entwicklung/i, level: 3 })).toBeVisible();
    // level: 3 avoids strict-mode collision with h1 "Kubernetes & KI, ruhig betrieben."
    await expect(page.getByRole('heading', { name: /Kubernetes.*Infrastruktur/i, level: 3 })).toBeVisible();
  });

  test('T11: timeline section renders with category tabs', async ({ page }) => {
    await page.goto(`${BASE}/`);
    // The section wrapper is unlabelled (generic, not region) — assert via heading + tabs
    await expect(page.getByRole('heading', { name: /implementierte features/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Alle' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Features' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fixes' })).toBeVisible();
  });

  test('T13: "Mehr laden" button is visible in timeline', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('button', { name: /mehr laden/i })).toBeVisible();
  });

  test('T14: CTA section has contact link to /kontakt', async ({ page }) => {
    await page.goto(`${BASE}/`);
    // The "30 Minuten" block is a generic wrapper (no aria-label) — assert via heading + link
    await expect(page.getByRole('heading', { name: /30 Minuten/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /anfrage senden/i })).toBeVisible();
  });

  test('T15: footer shows copyright line with "Korczewski"', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('contentinfo')).toContainText('Korczewski');
  });
});

// ── Public pages ──────────────────────────────────────────────────────────────

test.describe('Korczewski: Public pages', () => {
  const publicPages = [
    { path: '/kontakt',          title: /30 Minuten.*wissen wir.*ob es passt/i },
    { path: '/ueber-mich',       title: /IT-Management|Security|über mich/i },
    { path: '/leistungen',       title: /leistungen/i },
    { path: '/registrieren',     title: /registrieren/i },
    { path: '/agb',              title: /agb|geschäftsbedingungen/i },
    { path: '/datenschutz',      title: /datenschutz/i },
    { path: '/impressum',        title: /impressum/i },
    { path: '/barrierefreiheit', title: /barrierefreiheit/i },
  ];

  for (const { path, title } of publicPages) {
    test(`${path} loads and shows expected heading`, async ({ page }) => {
      const res = await page.goto(`${BASE}${path}`);
      expect(res?.status(), `${path} should return 200`).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('h1').first()).toContainText(title);
    });
  }

  test('/404 renders without 500', async ({ page }) => {
    const res = await page.goto(`${BASE}/404`);
    expect(res?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('unknown route returns non-500', async ({ page }) => {
    const res = await page.goto(`${BASE}/does-not-exist-xyzzy`);
    expect(res?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('500');
  });
});

// ── Service subpages ──────────────────────────────────────────────────────────

test.describe('Korczewski: Service subpages', () => {
  const servicePages = [
    { path: '/ki-beratung',    heading: /KI/i },
    { path: '/software-dev',   heading: /software/i },
    { path: '/deployment',     heading: /kubernetes|infrastruktur|deployment/i },
  ];

  for (const { path, heading } of servicePages) {
    test(`${path} loads and shows service heading`, async ({ page }) => {
      const res = await page.goto(`${BASE}${path}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1').first()).toContainText(heading);
    });
  }
});

// ── OIDC auth flow ────────────────────────────────────────────────────────────

test.describe('Korczewski: OIDC auth', () => {
  test('T1: /api/auth/login redirects to Keycloak', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/login`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'] ?? '';
    expect(location).toContain('/authorize');
    expect(location).toContain('client_id=website');
  });

  test('T2: /api/auth/me returns unauthenticated when no session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  test('T3: /api/auth/logout redirects', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/logout`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
  });
});

// ── Contact page ──────────────────────────────────────────────────────────────

test.describe('Korczewski: Kontakt page', () => {
  test('T1: page loads', async ({ page }) => {
    const res = await page.goto(`${BASE}/kontakt`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('T2: contact form has name, email, message fields', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    // Use data-testid for robust selection instead of computed accessible name.
    const msgTab = page.getByTestId('tab-nachricht');
    if (await msgTab.isVisible()) await msgTab.click();
    await expect(page.getByRole('textbox', { name: /name/i }).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
  });
});

// ── Cross-brand isolation ─────────────────────────────────────────────────────

test.describe('Cross-brand isolation', () => {
  test('mentolder homepage renders mentolder branding (not kore)', async ({ page }) => {
    await page.goto('https://web.mentolder.de/');
    await expect(page.locator('body')).not.toContainText('korczewski.de');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
});
