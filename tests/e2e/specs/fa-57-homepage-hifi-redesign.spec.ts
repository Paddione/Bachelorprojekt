import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

test.describe('FA-57: Mentolder Homepage hifi-Redesign [T001034]', { tag: ['@smoke', '@website'] }, () => {
  test.describe.configure({ retries: 1 });

  test('T1: Hero-Sektion rendert mit h1 und Kicker', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const hero = page.locator('section[aria-label="Hero-Bereich"]');
    await expect(hero).toBeVisible({ timeout: 60_000 });
    await expect(hero.locator('h1')).toBeVisible();
    await expect(hero.locator('.kicker-row')).toBeVisible();
    // Die Kicker-Zeile enthält mindestens einen Textspan
    const kickerSpans = hero.locator('.kicker-row span:not(.bar):not(.sep-dot)');
    await expect(kickerSpans.first()).toBeVisible();
  });

  test('T2: Hero-Lede (Untertitel) ist vorhanden', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const lede = page.locator('.hero .lede');
    await expect(lede).toBeVisible({ timeout: 60_000 });
    const text = await lede.textContent();
    expect(text?.trim().length).toBeGreaterThan(20);
  });

  test('T3: StatsStrip zeigt Kennzahlen', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const strip = page.locator('section.strip[aria-label]');
    await expect(strip).toBeVisible({ timeout: 60_000 });
    const stats = strip.locator('.stat');
    await expect(stats.first()).toBeVisible();
    expect(await stats.count()).toBeGreaterThan(0);
    // Jede Stat hat eine Zahl und ein Label
    const firstNum = strip.locator('.stat-num').first();
    await expect(firstNum).toBeVisible();
  });

  test('T4: FAQ-Sektion ist vorhanden und Accordion klappt auf', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const faqSection = page.locator('section.faq-section');
    await expect(faqSection).toBeVisible({ timeout: 60_000 });

    const firstBtn = faqSection.locator('.faq-btn').first();
    // Scrolle in den Viewport → löst client:visible Hydration aus
    await firstBtn.scrollIntoViewIfNeeded();
    // Warte bis die astro-island für die FAQ-Komponente hydriert ist (ssr-Attr weg)
    await page.waitForFunction(
      () => {
        const island = document.querySelector('astro-island:has(.faq-btn), astro-island:has(.faq-section)');
        return !island || !island.hasAttribute('ssr');
      },
      { timeout: 12_000 }
    );

    // Accordion startet geschlossen
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');

    // Aufklappen durch Klick
    await firstBtn.click();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 });

    // Answer-Panel sichtbar
    const firstAnswer = faqSection.locator('[id^="faq-answer-"]').first();
    await expect(firstAnswer).toBeVisible();
  });

  test('T5: FAQ-Accordion schließt beim zweiten Klick', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const firstBtn = page.locator('.faq-btn').first();
    await firstBtn.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => {
        const island = document.querySelector('astro-island:has(.faq-btn), astro-island:has(.faq-section)');
        return !island || !island.hasAttribute('ssr');
      },
      { timeout: 12_000 }
    );

    await firstBtn.click();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 });

    await firstBtn.click();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('T6: Process-Sektion zeigt Schritte', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const processSection = page.locator('section.process');
    await expect(processSection).toBeVisible({ timeout: 60_000 });

    const heading = processSection.locator('#process-heading');
    await expect(heading).toBeVisible();

    const steps = processSection.locator('[role="list"] [role="listitem"], .step');
    expect(await steps.count()).toBeGreaterThan(0);
  });

  test('T7: WhyMe-Sektion ist vorhanden', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const whySection = page.locator('section.why-me, section[aria-labelledby*="why"]');
    await whySection.scrollIntoViewIfNeeded();
    await expect(whySection).toBeVisible({ timeout: 60_000 });
  });

  test('T8: ServiceRow-Sektion rendert Angebote', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const offersSection = page.locator('#angebote');
    await expect(offersSection).toBeVisible({ timeout: 60_000 });

    // Mindestens eine ServiceRow vorhanden (Svelte rendert .offer als Wrapper-Div)
    const rows = offersSection.locator('.offer');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('T9: CallToAction-Sektion hat Link zur Kontaktseite', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // CTA enthält Link zu /kontakt — nach unten scrollen um client:visible zu triggern
    const ctaLink = page.locator('a[href="/kontakt"]').last();
    await ctaLink.scrollIntoViewIfNeeded();
    await expect(ctaLink).toBeVisible({ timeout: 60_000 });
  });

  test('T10: Seite hat keine JavaScript-Konsolenfehler beim Laden', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Keine kritischen JS-Fehler (ResizeObserver-Warnings sind harmlos)
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
