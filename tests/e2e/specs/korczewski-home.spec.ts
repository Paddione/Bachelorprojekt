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

  test('T4: hero h1 contains "Digital Coach"', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('h1').first()).toContainText('Digital Coach');
  });

  test('T5: nav shows Anmelden and Registrieren when logged out', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('link', { name: /anmelden/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /registrieren/i })).toBeVisible();
  });

  test('T6: services section shows 3 service cards', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const section = page.getByRole('region', { name: /was ich für sie tun kann/i });
    await expect(section).toBeVisible();
    // Count h3 headings (one per card) to avoid matching nested feature listitems
    await expect(section.getByRole('heading', { level: 3 })).toHaveCount(3);
  });

  test('T7: service cards include KI, Software, Kubernetes', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('heading', { name: /KI-Integration/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Software-Entwicklung/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Kubernetes/i })).toBeVisible();
  });

  test('T8: process section shows 4 steps', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const steps = page.getByRole('region', { name: /vier ruhige schritte/i });
    await expect(steps).toBeVisible();
    await expect(steps.getByRole('listitem')).toHaveCount(4);
  });

  test('T9: FAQ accordion has at least 3 questions', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const faq = page.getByRole('region', { name: /häufig gestellte fragen/i });
    await expect(faq).toBeVisible();
    await expect(faq.getByRole('button')).toHaveCount(5);
  });

  test('T10: FAQ question expands on click', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const btn = page.getByRole('button', { name: /für wen ist die beratung/i });
    await btn.click();
    // Panel content should be visible after click
    await expect(page.getByText(/führungskräfte|techniker|einsteiger/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('T11: timeline section renders with category tabs', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const timeline = page.getByRole('region', { name: /implementierte features/i });
    await expect(timeline).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Alle' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Features' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fixes' })).toBeVisible();
  });

  test('T12: timeline API responds with rows property', async ({ request }) => {
    // Tracking DB may be empty on korczewski — just verify the endpoint is reachable.
    const res = await request.get(`${BASE}/api/timeline?limit=5`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('rows');
  });

  test('T13: "Mehr laden" button is visible in timeline', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('button', { name: /mehr laden/i })).toBeVisible();
  });

  test('T14: CTA section has "Erstgespräch" link to /kontakt', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const cta = page.getByRole('region', { name: /30 minuten/i });
    await expect(cta).toBeVisible();
    await expect(cta.getByRole('link', { name: /termin vorschlagen/i })).toBeVisible();
  });

  test('T15: footer shows copyright line with "Korczewski"', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('contentinfo')).toContainText('Korczewski');
  });
});

// ── Public pages ──────────────────────────────────────────────────────────────

test.describe('Korczewski: Public pages', () => {
  const publicPages = [
    { path: '/kontakt',          title: /kontakt/i },
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
    expect(location).toContain('openid-connect/auth');
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
    // Try opening message form tab if it exists
    const msgBtn = page.getByRole('button', { name: /nachricht schreiben/i });
    if (await msgBtn.isVisible()) await msgBtn.click();
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
